import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import geminiService, { EQAnalysisResult, ConversationState } from '../../lib/gemini-service';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Mic, MicOff, Send, Home, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

const Journey = () => {
  const [isListening, setIsListening] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [aiMessage, setAiMessage] = useState<string>('');
  const [userMessage, setUserMessage] = useState<string>('');
  const [eqScore, setEqScore] = useState<number | null>(null);
  const [feedbackData, setFeedbackData] = useState<string | null>(null);
  const [categoryScores, setCategoryScores] = useState<Record<string, any> | null>(null);
  const [strengths, setStrengths] = useState<string[]>([]);
  const [weaknesses, setWeaknesses] = useState<string[]>([]);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [readyToAnalyze, setReadyToAnalyze] = useState(false);
  const [emotionalVocabulary, setEmotionalVocabulary] = useState<string[]>([]);
  const [keyInsights, setKeyInsights] = useState<string[]>([]);
  const [showTips, setShowTips] = useState(true);
  
  const [conversationState, setConversationState] = useState<ConversationState>(geminiService.createConversationState());
  const [conversationHistory, setConversationHistory] = useState<Array<{
    id: string;
    sender: 'user' | 'ai';
    message: string;
    timestamp: Date;
  }>>([]);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();

  useEffect(() => {
    const checkMicrophonePermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicPermission(true);
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error("Microphone permission error:", err);
        setMicPermission(false);
      }
    };
    
    checkMicrophonePermission();
  }, []);

  // Update useEffect to prevent duplicate text accumulation
  useEffect(() => {
    if (transcript) {
      // Only add the new transcript content, not already captured content
      const currentTranscript = transcript.trim();
      const currentUserMessage = userMessage.trim();
      
      if (currentTranscript && !currentUserMessage.endsWith(currentTranscript)) {
        // If current message doesn't already contain this transcript
        if (currentUserMessage && currentTranscript.includes(currentUserMessage)) {
          // If transcript contains the full message (happens on reconnect), 
          // just use the transcript to avoid duplication
          setUserMessage(currentTranscript);
        } else {
          // Otherwise append only the new content
          const newContent = currentUserMessage ? 
            currentTranscript.slice(currentTranscript.indexOf(currentUserMessage) + currentUserMessage.length) : 
            currentTranscript;
          
          if (newContent) {
            setUserMessage(prev => (prev ? prev + ' ' : '') + newContent.trim());
          }
        }
      }
    }
  }, [transcript]);

  useEffect(() => {
    if (!listening && isListening) {
      setIsListening(false);
      // Removed handleSpeechEnd() call - no longer resetting transcript or setting readyToAnalyze
    }
  }, [listening, isListening]);

  useEffect(() => {
    if (conversationHistory.length === 0) {
      const greeting = geminiService.getInitialGreeting();
      setConversationHistory([
        {
          id: Date.now().toString(),
          sender: 'ai',
          message: greeting,
          timestamp: new Date()
        }
      ]);
      setAiMessage(greeting);
    }
  }, []);

  const startListening = () => {
    setIsListening(true);
    SpeechRecognition.startListening({ continuous: true });
  };

  const stopListening = () => {
    setIsListening(false);
    SpeechRecognition.stopListening();
    // Removed resetTranscript() - no longer resetting transcript when stopping
  };

  const speakMessage = (text: string) => {
    setAiSpeaking(true);
    const speech = new SpeechSynthesisUtterance(text);
    speech.onend = () => {
      setAiSpeaking(false);
    };
    window.speechSynthesis.speak(speech);
  };

  const handleUserResponse = async () => {
    if (!userMessage.trim()) {
      return;
    }

    try {
      setIsLoading(true);
      
      const userMessageObj = {
        id: Date.now().toString(),
        sender: 'user' as const,
        message: userMessage,
        timestamp: new Date()
      };
      setConversationHistory(prev => [...prev, userMessageObj]);
      
      const { message: nextAiMessage, updatedState } = geminiService.getNextMessage(
        conversationState,
        userMessage
      );
      
      if (updatedState.stage === 'analysis') {
        const result = await geminiService.analyzeConversationResponses(updatedState);
        updatedState.analysisResults = result;
        
        setEqScore(result.score);
        setFeedbackData(result.feedback);
        setCategoryScores(result.categoryScores || null);
        
        if (result.strengthsAndWeaknesses) {
          setStrengths(result.strengthsAndWeaknesses.strengths);
          setWeaknesses(result.strengthsAndWeaknesses.weaknesses);
        }
        
        if (result.emotionalVocabulary) {
          setEmotionalVocabulary(result.emotionalVocabulary);
        }
        
        if (result.keyInsights) {
          setKeyInsights(result.keyInsights);
        }

        const analysisMessage = {
          id: Date.now().toString(),
          sender: 'ai' as const,
          message: 'I have analyzed your responses and have some insights to share.',
          timestamp: new Date()
        };
        
        const feedbackMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'ai' as const,
          message: result.responseText,
          timestamp: new Date(Date.now() + 1)
        };
        
        setConversationHistory(prev => [...prev, analysisMessage, feedbackMessage]);
        speakMessage(result.responseText);
      } else if (updatedState.stage === 'feedback' && updatedState.analysisResults) {
        const feedbackMessage = {
          id: Date.now().toString(),
          sender: 'ai' as const,
          message: updatedState.analysisResults.responseText,
          timestamp: new Date()
        };
        setConversationHistory(prev => [...prev, feedbackMessage]);
        speakMessage(updatedState.analysisResults.responseText);
      } else {
        const aiMessageObj = {
          id: Date.now().toString(),
          sender: 'ai' as const,
          message: nextAiMessage,
          timestamp: new Date()
        };
        setConversationHistory(prev => [...prev, aiMessageObj]);
        setAiMessage(nextAiMessage);
        speakMessage(nextAiMessage);
      }
      
      setConversationState(updatedState);
      setUserMessage('');
      resetTranscript(); // Only reset transcript after sending
      
    } catch (error) {
      console.error('Error in conversation:', error);
      const errorMessage = {
        id: Date.now().toString(),
        sender: 'ai' as const,
        message: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setConversationHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewJourney = () => {
    setEqScore(null);
    setFeedbackData(null);
    setCategoryScores(null);
    setStrengths([]);
    setWeaknesses([]);
    setEmotionalVocabulary([]);
    setKeyInsights([]);
    
    const newState = geminiService.createConversationState();
    setConversationState(newState);
    
    const greeting = geminiService.getInitialGreeting();
    setConversationHistory([{
      id: Date.now().toString(),
      sender: 'ai',
      message: greeting,
      timestamp: new Date()
    }]);
    
    setAiMessage(greeting);
    speakMessage(greeting);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleUserResponse();
  };

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="p-6 text-center">
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">
          <h3 className="font-bold text-lg">Speech Recognition Not Supported</h3>
          <p>Your browser doesn't support speech recognition. Please try Chrome or Edge browser instead.</p>
          <Link to="/" className="mt-4 inline-block px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  if (micPermission === false) {
    return (
      <div className="p-6 text-center">
        <div className="p-4 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg">
          <h3 className="font-bold text-lg">Microphone Access Required</h3>
          <p>Please allow microphone access in your browser to use the voice features.</p>
          <div className="flex justify-center gap-4 mt-4">
            <button 
              onClick={() => navigator.mediaDevices.getUserMedia({ audio: true })
                .then(() => setMicPermission(true))
                .catch(err => console.error(err))
              }
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
            >
              Request Microphone Access
            </button>
            <Link to="/" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isMicrophoneAvailable) {
    return (
      <div className="p-6 text-center">
        <div className="p-4 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg">
          <h3 className="font-bold text-lg">Microphone Not Available</h3>
          <p>Please ensure your microphone is connected and you've granted permission to use it.</p>
          <Link to="/" className="mt-4 inline-block px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-600';
    if (score >= 65) return 'bg-blue-600';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col min-h-screen pt-16 pb-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Home size={24} />
              </motion.div>
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
              Your EQ Learning Journey
            </h1>
          </div>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startNewJourney}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
          >
            <RefreshCw size={16} />
            <span className="hidden sm:inline">New Journey</span>
          </motion.button>
        </div>
      </header>
      
      <div className="container mx-auto px-4 max-w-6xl flex-1 space-y-8">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <span className="flex h-8 w-8 rounded-full bg-white/20 items-center justify-center">
                  💬
                </span>
                EQ Conversation
              </h2>
              {isLoading && (
                <span className="text-xs px-2 py-1 bg-white/20 text-white rounded-full animate-pulse flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                  </span>
                  Processing
                </span>
              )}
            </div>
            
            <div className="h-[400px] overflow-y-auto p-4 space-y-3">
              <AnimatePresence>
                {conversationHistory.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`mb-3 ${msg.sender === 'ai' ? 'text-left' : 'text-right'}`}
                  >
                    <div 
                      className={`inline-block p-3 rounded-lg max-w-[85%] ${
                        msg.sender === 'ai' 
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white' 
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <p className="text-xs opacity-70 mt-1 text-right">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {conversationState.complete && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border-t border-green-100 dark:border-green-900/30">
                <p className="text-green-700 dark:text-green-400 text-sm mb-2">
                  🌟 Amazing work! You've completed this reflection journey. Each conversation helps you grow stronger in understanding your emotions.
                </p>
                <button 
                  onClick={startNewJourney}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                >
                  Begin New Journey
                </button>
              </div>
            )}
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-500 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <span className="flex h-8 w-8 rounded-full bg-white/20 items-center justify-center">
                  🎙️
                </span>
                Your Voice
              </h2>
              {listening && (
                <span className="text-xs px-2 py-1 bg-red-400/30 text-white rounded-full animate-pulse flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"></span>
                  </span>
                  Recording
                </span>
              )}
            </div>
            
            <div className="flex-1 p-4 overflow-hidden flex flex-col">
              <div className="flex-1 min-h-[150px] max-h-[250px] overflow-y-auto bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700 relative">
                {userMessage ? (
                  <p className="whitespace-pre-wrap">{userMessage}</p>
                ) : (
                  <p className="text-gray-400 dark:text-gray-500">Your speech will appear here...</p>
                )}
                
                {isListening && (
                  <div className="absolute top-2 right-2 flex items-center">
                    <span className="animate-pulse h-3 w-3 bg-red-500 rounded-full mr-1"></span>
                    <span className="text-xs text-red-500">Recording</span>
                  </div>
                )}
              </div>
              
              <form onSubmit={handleManualSubmit} className="flex gap-2 mb-4">
                {/* User mic control button: blue means unmuted (can speak), red means muted */}
                <button
                  type="button"
                  onClick={() => {
                    if (isListening || listening) {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
                  disabled={isLoading || aiSpeaking || conversationState.complete}
                  className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${
                    (isLoading || aiSpeaking || conversationState.complete)
                      ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                      : (isListening || listening)
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                  title={(isListening || listening) ? 'Pause (stop listening)' : 'Resume (start listening)'}
                >
                  {(isListening || listening) ? <Mic size={20} /> : <MicOff size={20} />}
                </button>

                {/* AI voice control button */}
                <button
                  type="button"
                  onClick={() => {
                    window.speechSynthesis.cancel();
                    setAiSpeaking(false);
                  }}
                  disabled={!aiSpeaking}
                  className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${
                    aiSpeaking
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                  }`}
                  title="Stop AI voice"
                >
                  <MicOff size={20} />
                </button>

                <button
                  type="submit"
                  disabled={!userMessage.trim() || isLoading || aiSpeaking || conversationState.complete}
                  className={`flex-1 px-6 py-2 rounded-lg transition-colors ${
                    !userMessage.trim() || isLoading || aiSpeaking || conversationState.complete
                      ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Send size={16} />
                      <span>Send Response</span>
                    </div>
                  )}
                </button>
              </form>
              
              {(aiSpeaking || isLoading) && (
                <div className="px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 mb-4">
                  <p className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <div className="animate-spin h-3 w-3 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full"></div>
                    {aiSpeaking ? "AI is speaking, please wait..." : "Processing your response..."}
                  </p>
                </div>
              )}
              
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center p-3 cursor-pointer" onClick={() => setShowTips(!showTips)}>
                  <h3 className="font-medium text-sm">Tips for Your EQ Journey</h3>
                  <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    {showTips ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
                
                {showTips && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-3 pb-3"
                  >
                    <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
                      <li className="flex">
                        <span className="text-purple-500 mr-2">💡</span>
                        <span>Express yourself freely - there are no wrong answers!</span>
                      </li>
                      <li className="flex">
                        <span className="text-purple-500 mr-2">🎯</span>
                        <span>Be specific about how you're feeling and why</span>
                      </li>
                      <li className="flex">
                        <span className="text-purple-500 mr-2">🌱</span>
                        <span>Growth happens step by step - take your time</span>
                      </li>
                      <li className="flex">
                        <span className="text-purple-500 mr-2">🤝</span>
                        <span>Your responses help build better self-awareness</span>
                      </li>
                    </ul>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {eqScore !== null && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h2 className="text-2xl font-semibold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
              Your EQ Analysis Results
            </h2>
            
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium">Overall EQ Score</h3>
                <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
                  {eqScore}/100
                </div>
              </div>
              <div className="relative h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${eqScore}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`absolute top-0 left-0 h-full ${getScoreColor(eqScore)}`} 
                ></motion.div>
              </div>
            </div>
            
            {categoryScores && (
              <div className="mb-8">
                <h3 className="text-lg font-medium mb-4">EQ Dimensions</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(categoryScores).map(([category, data]: [string, any], index) => (
                    <motion.div 
                      key={category} 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * index }}
                      className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex justify-between mb-2">
                        <h4 className="font-medium">{category.replace('_', ' ')}</h4>
                        <span className="font-medium">{data.score}/100</span>
                      </div>
                      <div className="relative h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mb-2">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${data.score}%` }}
                          transition={{ duration: 0.8, delay: 0.2 * index, ease: "easeOut" }}
                          className={`absolute top-0 left-0 h-full ${getScoreColor(data.score)}`} 
                        ></motion.div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{data.comment}</p>
                      {data.examples && (
                        <div className="text-xs bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                          <p className="font-medium mb-1">Examples:</p>
                          <ul className="list-disc list-inside">
                            {data.examples.slice(0, 2).map((example: string, i: number) => (
                              <li key={i} className="text-gray-600 dark:text-gray-400">{example}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="mb-8 grid md:grid-cols-2 gap-6">
              {strengths.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-900/30"
                >
                  <h3 className="text-green-800 dark:text-green-400 font-medium mb-3 flex items-center">
                    <span className="w-6 h-6 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    Your EQ Strengths
                  </h3>
                  <ul className="space-y-2">
                    {strengths.map((strength, i) => (
                      <motion.li 
                        key={i} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + (i * 0.1) }}
                        className="flex"
                      >
                        <span className="text-green-600 dark:text-green-400 mr-2">✓</span>
                        <span className="text-green-700 dark:text-green-300">{strength}</span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              )}
              
              {weaknesses.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-900/30"
                >
                  <h3 className="text-amber-800 dark:text-amber-400 font-medium mb-3 flex items-center">
                    <span className="w-6 h-6 bg-amber-100 dark:bg-amber-800 rounded-full flex items-center justify-center mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </span>
                    Growth Opportunities
                  </h3>
                  <ul className="space-y-2">
                    {weaknesses.map((weakness, i) => (
                      <motion.li 
                        key={i} 
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + (i * 0.1) }}
                        className="flex"
                      >
                        <span className="text-amber-600 dark:text-amber-400 mr-2">→</span>
                        <span className="text-amber-700 dark:text-amber-300">{weakness}</span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </div>
            
            {keyInsights.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mb-8"
              >
                <h3 className="text-lg font-medium mb-3">Key Insights</h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900/30">
                  <ul className="space-y-2">
                    {keyInsights.map((insight, i) => (
                      <motion.li 
                        key={i} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 + (i * 0.1) }}
                        className="flex"
                      >
                        <span className="text-blue-600 dark:text-blue-400 mr-2">•</span>
                        <span className="text-blue-700 dark:text-blue-300">{insight}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
            
            {emotionalVocabulary && emotionalVocabulary.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="mb-8"
              >
                <h3 className="text-lg font-medium mb-3">Your Emotional Vocabulary</h3>
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex flex-wrap gap-2">
                    {emotionalVocabulary.map((word, index) => (
                      <motion.span 
                        key={index} 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.8 + (index * 0.05) }}
                        className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm"
                      >
                        {word}
                      </motion.span>
                    ))}
                    {emotionalVocabulary.length === 0 && (
                      <p className="text-gray-500 dark:text-gray-400 text-sm italic">No specific emotion words detected.</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
            
            {feedbackData && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="mb-6"
              >
                <h3 className="text-lg font-medium mb-3">Detailed Feedback</h3>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                  <p className="text-indigo-700 dark:text-indigo-300 whitespace-pre-wrap">{feedbackData}</p>
                </div>
              </motion.div>
            )}
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="mt-8 flex justify-center"
            >
              <button
                onClick={startNewJourney}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-full font-medium shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2"
              >
                <RefreshCw size={18} />
                Start a New EQ Journey
              </button>
            </motion.div>
          </motion.div>
        )}
      </div>
      
      {/* Footer */}
      <footer className="mt-auto pt-8">
        <div className="max-w-6xl mx-auto px-4 py-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              © {new Date().getFullYear()} EQ Coach AI. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link to="/" className="text-sm text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400">
                Home
              </Link>
              <Link to="/journey" className="text-sm text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400">
                Journey
              </Link>
              <Link to="/chat" className="text-sm text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400">
                Chat
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Journey;