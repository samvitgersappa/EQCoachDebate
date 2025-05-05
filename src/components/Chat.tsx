import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, RefreshCw, Home, ChevronDown, ChevronUp, Check, ArrowRight, MessageCircle, ThumbsUp, ThumbsDown, Mic, MicOff, Clock } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

// Update the DEBATE_TOPICS constant with categories and difficulty
const DEBATE_TOPICS = {
  beginner: [
    {
      topic: "Social media has a net positive impact on society",
      category: "Technology & Society",
      difficulty: "Beginner"
    },
    {
      topic: "School uniforms should be mandatory",
      category: "Education",
      difficulty: "Beginner"
    },
    {
      topic: "Video games have educational value",
      category: "Education & Technology",
      difficulty: "Beginner"
    }
  ],
  intermediate: [
    {
      topic: "Remote work should be the standard for most office jobs",
      category: "Work & Society",
      difficulty: "Intermediate"
    },
    {
      topic: "The four-day work week should be widely adopted",
      category: "Work & Society",
      difficulty: "Intermediate"
    },
    {
      topic: "Artificial intelligence is more beneficial than harmful to society",
      category: "Technology",
      difficulty: "Intermediate"
    }
  ],
  advanced: [
    {
      topic: "Universal basic income should be implemented globally",
      category: "Economics & Society",
      difficulty: "Advanced"
    },
    {
      topic: "Cryptocurrency will eventually replace traditional banking",
      category: "Economics & Technology",
      difficulty: "Advanced"
    },
    {
      topic: "Genetic engineering of human embryos should be permitted",
      category: "Ethics & Science",
      difficulty: "Advanced"
    }
  ]
};

// Debate stages
type DebateStage = 'topic_selection' | 'side_selection' | 'opening_statement' | 'rebuttal' | 'closing_statement' | 'conclusion';

// Message type
interface Message {
  id: string;
  sender: 'user' | 'ai';
  message: string;
  stage?: DebateStage;
  timestamp: Date;
}

// Debate Analysis interface
interface DebateAnalysis {
  overallSummary: string;
  userArgumentStrengths: string[];
  userArgumentWeaknesses: string[];
  aiArgumentStrengths: string[];
  aiArgumentWeaknesses: string[];
  userDebateSkills: {
    skill: string;
    rating: number;
    feedback: string;
  }[];
  improvementSuggestions: string[];
}

const Debate = () => {
  const [topics, setTopics] = useState<string[]>(DEBATE_TOPICS);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [userSide, setUserSide] = useState<'for' | 'against' | null>(null);
  const [debateStage, setDebateStage] = useState<DebateStage>('topic_selection');
  const [messages, setMessages] = useState<Message[]>([]);
  const [userMessage, setUserMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const [customTopic, setCustomTopic] = useState('');
  const [timer, setTimer] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(120); // 2 minutes default
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [debateAnalysis, setDebateAnalysis] = useState<DebateAnalysis | null>(null);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Speech recognition setup
  const [isListening, setIsListening] = useState(false);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();

  // Check microphone permission
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

  // Initialize media recorder for voice recording
  useEffect(() => {
    if (micPermission) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          const recorder = new MediaRecorder(stream);
          
          recorder.addEventListener('dataavailable', event => {
            setAudioChunks(currentChunks => [...currentChunks, event.data]);
          });
          
          recorder.addEventListener('stop', () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            setAudioUrl(audioUrl);
          });
          
          setMediaRecorder(recorder);
        })
        .catch(err => console.error("Error setting up media recorder:", err));
    }
  }, [micPermission, audioChunks]);

  // Start recording function
  const startRecording = () => {
    if (mediaRecorder && !isRecording) {
      setAudioChunks([]);
      setAudioUrl(null);
      mediaRecorder.start();
      setIsRecording(true);
    }
  };

  // Stop recording function
  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  // Update user message when transcript changes
  useEffect(() => {
    if (transcript) {
      setUserMessage(transcript);
    }
  }, [transcript]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle timer functionality
  useEffect(() => {
    let interval: number | null = null;
    
    if (isTimerRunning && timeRemaining > 0) {
      interval = window.setInterval(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
    } else if (timeRemaining === 0) {
      setIsTimerRunning(false);
      if (userMessage.trim() === '') {
        handleTimeUp();
      }
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isTimerRunning, timeRemaining]);

  // Format seconds to MM:SS
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  // Speech handling
  const startListening = () => {
    resetTranscript();
    setIsListening(true);
    SpeechRecognition.startListening({ continuous: true });
    // Stop AI speech when starting listening
    if (aiSpeaking) {
      window.speechSynthesis.cancel();
      setAiSpeaking(false);
    }
  };

  const stopListening = () => {
    setIsListening(false);
    SpeechRecognition.stopListening();
    // Stop AI speech when stopping listening
    if (aiSpeaking) {
      window.speechSynthesis.cancel();
      setAiSpeaking(false);
    }
  };

  const speakMessage = (text: string) => {
    setAiSpeaking(true);
    const speech = new SpeechSynthesisUtterance(text);
    speech.onend = () => {
      setAiSpeaking(false);
    };
    window.speechSynthesis.speak(speech);
  };

  // Add initial message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: Date.now().toString(),
          sender: 'ai',
          message: "Welcome to the Debate Arena! Please select a topic you'd like to debate about, or suggest your own topic.",
          timestamp: new Date()
        }
      ]);
    }
  }, []);

  // Start timer
  const startTimer = (seconds: number = 120) => {
    setTimeRemaining(seconds);
    setIsTimerRunning(true);
  };

  // Stop timer
  const stopTimer = () => {
    setIsTimerRunning(false);
  };

  // Handle time up
  const handleTimeUp = () => {
    const timeUpMessage: Message = {
      id: Date.now().toString(),
      sender: 'ai',
      message: "Time's up! Let's move on with the debate.",
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, timeUpMessage]);
    advanceDebateStage();
  };

  // Get AI response based on debate stage
  const getAIResponse = async (userInput: string, stage: DebateStage): Promise<string> => {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      
      const aiSide = userSide === 'for' ? 'against' : 'for';
      
      let prompt = '';
      
      switch (stage) {
        case 'opening_statement':
          prompt = `You are participating in a formal debate on the topic: "${selectedTopic}". 
          You are arguing ${aiSide} this proposition. 
          The user has just made their opening statement: "${userInput}"
          
          Provide a strong, well-structured opening statement from your side (${aiSide}).
          Your response should:
          1. Clearly state your position
          2. Provide 2-3 key arguments with brief supporting evidence
          3. Address anticipated counterarguments
          4. Be persuasive and respectful
          5. Keep the response under 200 words
          
          Do not use any labels or prefixes like "Opening Statement:" - just provide the statement itself.`;
          break;
          
        case 'rebuttal':
          prompt = `You are continuing a formal debate on the topic: "${selectedTopic}".
          You are arguing ${aiSide} this proposition.
          The user, who is arguing ${userSide}, has just made this rebuttal to your previous points: "${userInput}"
          
          Provide a strategic rebuttal that:
          1. Directly addresses and counters their strongest points
          2. Strengthens your previous arguments with additional evidence
          3. Introduces a new angle or perspective to strengthen your case
          4. Uses persuasive language while maintaining respect
          5. Keeps the response under 200 words
          
          Do not use any labels or prefixes - just provide the rebuttal itself.`;
          break;
          
        case 'closing_statement':
          prompt = `You are concluding a formal debate on the topic: "${selectedTopic}".
          You are arguing ${aiSide} this proposition.
          The user, who is arguing ${userSide}, has just made this point: "${userInput}"
          
          Provide a compelling closing statement that:
          1. Summarizes your strongest arguments and evidence
          2. Addresses the weaknesses in your opponent's position
          3. Reinforces why your position is more logical/beneficial
          4. Ends with a memorable concluding thought
          5. Keeps the response under 200 words
          
          Do not use any labels or prefixes - just provide the closing statement itself.`;
          break;
          
        default:
          prompt = `You are participating in a debate on: "${selectedTopic}". 
          Provide a thoughtful response to: "${userInput}" 
          Keep your response under 200 words.`;
      }
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return text;
    } catch (error) {
      console.error("Error getting AI response:", error);
      return "I apologize, but I'm having trouble formulating a response. Let's continue the debate with your next point.";
    }
  };

  // Handle topic selection
  const handleSelectTopic = (topic: string) => {
    setSelectedTopic(topic);
    
    const topicSelectedMessage: Message = {
      id: Date.now().toString(),
      sender: 'ai',
      message: `Great! We'll debate about: "${topic}". Would you like to argue FOR or AGAINST this topic?`,
      timestamp: new Date(),
      stage: 'side_selection'
    };
    
    setMessages(prev => [...prev, topicSelectedMessage]);
    setDebateStage('side_selection');
  };

  // Handle custom topic submission
  const handleCustomTopicSubmit = () => {
    if (customTopic.trim().length > 0) {
      handleSelectTopic(customTopic.trim());
      setCustomTopic('');
    }
  };

  // Handle side selection
  const handleSelectSide = (side: 'for' | 'against') => {
    setUserSide(side);
    
    const sideSelectedMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      message: `I'll argue ${side} the topic: "${selectedTopic}"`,
      timestamp: new Date()
    };
    
    const aiSide = side === 'for' ? 'against' : 'for';
    
    const aiResponseMessage: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'ai',
      message: `Great! I'll take the ${aiSide} position. Let's begin with our opening statements. You'll go first - make a compelling case ${side} the topic in your opening statement. You'll have 2 minutes to prepare and submit your opening statement.`,
      timestamp: new Date(),
      stage: 'opening_statement'
    };
    
    setMessages(prev => [...prev, sideSelectedMessage, aiResponseMessage]);
    setDebateStage('opening_statement');
    startTimer();
  };

  // Submit user message
  const handleSubmitMessage = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!userMessage.trim() && debateStage !== 'topic_selection') {
      return;
    }
    
    stopTimer();
    setIsLoading(true);
    
    const userMessageObj: Message = {
      id: Date.now().toString(),
      sender: 'user',
      message: userMessage,
      timestamp: new Date(),
      stage: debateStage
    };
    
    setMessages(prev => [...prev, userMessageObj]);
    setUserMessage('');
    resetTranscript();
    
    // Get AI response
    if (debateStage !== 'topic_selection' && debateStage !== 'side_selection' && debateStage !== 'conclusion') {
      try {
        const aiResponse = await getAIResponse(userMessage, debateStage);
        
        const aiMessageObj: Message = {
          id: Date.now().toString(),
          sender: 'ai',
          message: aiResponse,
          timestamp: new Date(),
          stage: debateStage
        };
        
        setMessages(prev => [...prev, aiMessageObj]);
        speakMessage(aiResponse);
        
        // Move to next stage
        advanceDebateStage();
        
      } catch (error) {
        console.error("Error in debate flow:", error);
        
        const errorMessage: Message = {
          id: Date.now().toString(),
          sender: 'ai',
          message: "I encountered an error. Let's continue with the next part of our debate.",
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, errorMessage]);
        advanceDebateStage();
      }
    }
    
    setIsLoading(false);
  };

  // Generate debate analysis
  const generateDebateAnalysis = async () => {
    if (!selectedTopic || !userSide) return;
    
    try {
      setIsGeneratingAnalysis(true);
      
      const userMessages = messages.filter(msg => msg.sender === 'user' && msg.stage && 
        ['opening_statement', 'rebuttal', 'closing_statement'].includes(msg.stage));
      
      const aiMessages = messages.filter(msg => msg.sender === 'ai' && msg.stage && 
        ['opening_statement', 'rebuttal', 'closing_statement'].includes(msg.stage));
      
      if (userMessages.length === 0 || aiMessages.length === 0) {
        throw new Error("Not enough debate content to analyze");
      }
      
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      
      const userMessagesText = userMessages.map(msg => 
        `${msg.stage}: ${msg.message}`).join("\n\n");
      
      const aiMessagesText = aiMessages.map(msg => 
        `${msg.stage}: ${msg.message}`).join("\n\n");
      
      const prompt = `
        As a professional debate coach, analyze this completed debate on the topic: "${selectedTopic}".
        
        The User was arguing ${userSide} the proposition. Here are their arguments:
        
        ${userMessagesText}
        
        The AI was arguing ${userSide === 'for' ? 'against' : 'for'} the proposition. Here are their arguments:
        
        ${aiMessagesText}
        
        Provide a comprehensive analysis of the debate that includes:
        
        1. An overall summary of the debate quality (150-200 words)
        2. Strengths of the user's arguments (3-4 points)
        3. Areas of improvement for the user's arguments (3-4 points)
        4. Strengths of the AI's arguments (2-3 points)
        5. Weaknesses of the AI's arguments (2-3 points)
        6. Assessment of the user's debate skills with ratings (scale 1-10) for:
           - Logical Reasoning (with specific feedback)
           - Evidence Quality (with specific feedback)
           - Rebuttal Effectiveness (with specific feedback)
           - Persuasive Language (with specific feedback)
           - Structure and Organization (with specific feedback)
        7. Specific suggestions for improvement (4-5 actionable recommendations)
        
        Return the analysis as a JSON object with the following format:
        {
          "overallSummary": "string",
          "userArgumentStrengths": ["point1", "point2", ...],
          "userArgumentWeaknesses": ["point1", "point2", ...],
          "aiArgumentStrengths": ["point1", "point2", ...],
          "aiArgumentWeaknesses": ["point1", "point2", ...],
          "userDebateSkills": [
            {
              "skill": "Logical Reasoning",
              "rating": number,
              "feedback": "string"
            },
            // other skills...
          ],
          "improvementSuggestions": ["suggestion1", "suggestion2", ...]
        }
      `;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();
      
      // Extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysisData = JSON.parse(jsonMatch[0]);
        setDebateAnalysis(analysisData);
        
        // Add analysis to messages
        const analysisMessage: Message = {
          id: Date.now().toString(),
          sender: 'ai',
          message: "I've prepared an in-depth analysis of our debate. You can view it in the Analysis tab on the right side panel.",
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, analysisMessage]);
      } else {
        throw new Error("Could not parse analysis response");
      }
      
    } catch (error) {
      console.error("Error generating debate analysis:", error);
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        sender: 'ai',
        message: "I apologize, but I'm unable to generate a detailed analysis of our debate at this time.",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  // Advance to next debate stage
  const advanceDebateStage = () => {
    switch (debateStage) {
      case 'opening_statement':
        setDebateStage('rebuttal');
        const rebuttalPrompt: Message = {
          id: Date.now().toString(),
          sender: 'ai',
          message: "Now, let's move to the rebuttal phase. Please provide your counterarguments to what I've just presented. You have 2 minutes to prepare your rebuttal.",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, rebuttalPrompt]);
        startTimer();
        break;
        
      case 'rebuttal':
        setDebateStage('closing_statement');
        const closingPrompt: Message = {
          id: Date.now().toString(),
          sender: 'ai',
          message: "We're now moving to closing statements. Please provide your final arguments summarizing your position. You have 2 minutes to prepare your closing statement.",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, closingPrompt]);
        startTimer();
        break;
        
      case 'closing_statement':
        setDebateStage('conclusion');
        setIsGeneratingAnalysis(true);
        
        const analysisMessage: Message = {
          id: Date.now().toString(),
          sender: 'ai',
          message: "Thank you for participating in this debate! I'm now analyzing our discussion to provide you with insights and suggestions for improvement...",
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, analysisMessage]);
        
        // Generate debate analysis
        generateDebateAnalysis().then(() => {
          const conclusionMessage: Message = {
            id: Date.now().toString(),
            sender: 'ai',
            message: "The debate has concluded. Would you like to debate another topic?",
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, conclusionMessage]);
        });
        break;
        
      case 'conclusion':
        // Reset to start a new debate
        resetDebate();
        break;
        
      default:
        break;
    }
  };

  // Reset debate to start a new one
  const resetDebate = () => {
    setSelectedTopic(null);
    setUserSide(null);
    setDebateStage('topic_selection');
    setMessages([
      {
        id: Date.now().toString(),
        sender: 'ai',
        message: "Let's debate a new topic! Please select one from the list or suggest your own.",
        timestamp: new Date()
      }
    ]);
    setUserMessage('');
    setTimeRemaining(120);
    setIsTimerRunning(false);
    setDebateAnalysis(null);
    setAudioUrl(null);
    setAudioChunks([]);
  };

  // Get stage-specific instructions for the user
  const getStageInstructions = (): string => {
    switch (debateStage) {
      case 'topic_selection':
        return "Select a debate topic from the list or suggest your own.";
      case 'side_selection':
        return "Choose whether you want to argue FOR or AGAINST the selected topic.";
      case 'opening_statement':
        return "Present your opening statement with your main arguments supporting your position.";
      case 'rebuttal':
        return "Respond to your opponent's arguments and strengthen your own position.";
      case 'closing_statement':
        return "Summarize your strongest points and conclude your argument persuasively.";
      case 'conclusion':
        return "The debate has concluded. Would you like to debate another topic?";
      default:
        return "Participate in the debate by providing your perspective.";
    }
  };

  // Render microphone permission error
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
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
              Debate Practice Arena
            </h1>
          </div>
          
          {selectedTopic && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={resetDebate}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
            >
              <RefreshCw size={16} />
              <span className="hidden sm:inline">New Debate</span>
            </motion.button>
          )}
        </div>
      </header>
      
      <div className="container mx-auto px-4 max-w-6xl flex-1 space-y-8">
        {/* Main content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Debate panel - takes 2/3 on large screens */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 rounded-full bg-white/20 items-center justify-center">
                  <MessageCircle size={16} className="text-white" />
                </span>
                <h2 className="text-xl font-semibold text-white">
                  {selectedTopic ? 'Debate: ' + (selectedTopic.length > 25 ? selectedTopic.substring(0, 25) + '...' : selectedTopic) : 'Debate Arena'}
                </h2>
              </div>
              
              {isTimerRunning && (
                <span className="px-3 py-1 bg-white/20 text-white rounded-full flex items-center gap-1">
                  <Clock size={14} />
                  <span className="font-mono">{formatTime(timeRemaining)}</span>
                </span>
              )}
            </div>
            
            <div className="h-[500px] overflow-y-auto p-4 space-y-3">
              <AnimatePresence>
                {messages.map((msg) => (
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
                          : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
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
              
              <div ref={messagesEndRef} />
            </div>
            
            {/* Topic selection */}
            {debateStage === 'topic_selection' && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-900/30">
                <h3 className="font-medium text-blue-700 dark:text-blue-300 mb-3">
                  Choose your debate topic:
                </h3>
                
                <div className="space-y-6">
                  {Object.entries(DEBATE_TOPICS).map(([level, topics]) => (
                    <div key={level} className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        {level === 'beginner' && '🌱'}
                        {level === 'intermediate' && '⭐'}
                        {level === 'advanced' && '🏆'}
                        {level.charAt(0).toUpperCase() + level.slice(1)} Topics
                      </h4>
                      
                      <div className="grid gap-2 md:grid-cols-2">
                        {topics.map((topic, index) => (
                          <motion.button
                            key={index}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSelectTopic(topic.topic)}
                            className="p-3 bg-white dark:bg-gray-700 border border-blue-200 dark:border-blue-800 rounded-lg text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                          >
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                              {topic.topic}
                            </p>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                {topic.category}
                              </span>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Have another topic in mind? Suggest your own:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder="Enter your debate topic..."
                      className="flex-1 p-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                    <button
                      onClick={handleCustomTopicSubmit}
                      disabled={!customTopic.trim()}
                      className={`px-4 rounded-lg ${
                        !customTopic.trim()
                          ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                    >
                      Submit Topic
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Side selection */}
            {debateStage === 'side_selection' && (
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-t border-purple-100 dark:border-purple-900/30">
                <h3 className="font-medium text-purple-700 dark:text-purple-300 mb-3">
                  Choose your position:
                </h3>
                <div className="flex gap-4 justify-center">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSelectSide('for')}
                    className="flex-1 p-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex flex-col items-center gap-2"
                  >
                    <ThumbsUp size={28} />
                    <span>For (Support)</span>
                  </motion.button>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSelectSide('against')}
                    className="flex-1 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex flex-col items-center gap-2"
                  >
                    <ThumbsDown size={28} />
                    <span>Against (Oppose)</span>
                  </motion.button>
                </div>
              </div>
            )}
            
            {/* Message input */}
            {debateStage !== 'topic_selection' && debateStage !== 'side_selection' && (
              <form 
                onSubmit={handleSubmitMessage} 
                className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex gap-2 items-end"
              >
                <div className="flex-1 space-y-2">
                  <textarea
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    placeholder={`Type your ${debateStage.replace('_', ' ')} here...`}
                    disabled={isLoading || isGeneratingAnalysis}
                    className="w-full p-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
                    rows={3}
                  ></textarea>
                  
                  {debateStage !== 'conclusion' && (
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        Stage: {debateStage.replace('_', ' ')}
                      </span>
                      {isTimerRunning && (
                        <span className="font-mono">
                          Time remaining: {formatTime(timeRemaining)}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {audioUrl && (
                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="flex items-center justify-between gap-2">
                        <audio src={audioUrl} controls className="h-8 w-full" />
                        <button
                          type="button"
                          onClick={() => {
                            if (audioUrl) {
                              URL.revokeObjectURL(audioUrl);
                              setAudioUrl(null);
                              setAudioChunks([]);
                            }
                          }}
                          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-2">
                  {/* Voice recording button */}
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isLoading || aiSpeaking || !mediaRecorder}
                    className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      isRecording
                        ? 'bg-red-500 hover:bg-red-600 text-white pulse-animation' 
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                    } ${(isLoading || aiSpeaking || !mediaRecorder) && 'opacity-50 cursor-not-allowed'}`}
                  >
                    {isRecording ? <div className="h-3 w-3 bg-white rounded-sm"></div> : <Mic size={18} />}
                  </button>
                    {/* Speech recognition button */}
                  {browserSupportsSpeechRecognition && (
                    <button
                      type="button"
                      onClick={() => {
                        // If AI is speaking, stop it
                        if (aiSpeaking) {
                          window.speechSynthesis.cancel();
                          setAiSpeaking(false);
                          return;
                        }
                        // Otherwise, toggle speech recognition
                        if (isListening) {
                          stopListening();
                        } else {
                          startListening();
                        }
                      }}
                      disabled={isLoading || isRecording}
                      className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        isListening || aiSpeaking
                          ? 'bg-red-500 hover:bg-red-600 text-white' 
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                      } ${(isLoading || isRecording) && 'opacity-50 cursor-not-allowed'}`}
                    >
                      {aiSpeaking ? <MicOff size={18} /> : isListening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                  )}
                  
                  <button
                    type="submit"
                    disabled={isLoading || aiSpeaking || isGeneratingAnalysis || (debateStage !== 'conclusion' && !userMessage.trim())}
                    className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      isLoading || aiSpeaking || isGeneratingAnalysis || (debateStage !== 'conclusion' && !userMessage.trim())
                        ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed' 
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    {isLoading || isGeneratingAnalysis ? (
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
          
          {/* Sidebar - takes 1/3 on large screens */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-500 px-6 py-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <span className="flex h-8 w-8 rounded-full bg-white/20 items-center justify-center">
                  💡
                </span>
                {debateAnalysis ? "Debate Analysis" : "Debate Guide"}
              </h2>
            </div>
            
            <div className="flex-1 p-4 overflow-auto">
              {debateAnalysis ? (
                <div className="space-y-5">
                  {/* Summary */}
                  <div>
                    <h3 className="font-medium text-lg text-gray-800 dark:text-gray-200 mb-2">
                      Overall Summary
                    </h3>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300">
                      {debateAnalysis.overallSummary}
                    </div>
                  </div>
                  
                  {/* User Argument Strengths */}
                  <div>
                    <h3 className="font-medium text-lg text-gray-800 dark:text-gray-200 mb-2">
                      What You Did Well 🌟
                    </h3>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                      <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 list-disc pl-5">
                        {debateAnalysis.userArgumentStrengths.map((strength, index) => (
                          <li key={index}>{strength}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  {/* User Argument Weaknesses */}
                  <div>
                    <h3 className="font-medium text-lg text-gray-800 dark:text-gray-200 mb-2">
                      Growth Opportunities 🌱
                    </h3>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Here are some areas where you can focus to make your arguments even stronger:
                      </p>
                      <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 list-disc pl-5">
                        {debateAnalysis.userArgumentWeaknesses.map((weakness, index) => (
                          <li key={index}>{weakness}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  {/* Debate Skills Assessment */}
                  <div>
                    <h3 className="font-medium text-lg text-gray-800 dark:text-gray-200 mb-2">
                      Your Debate Skills Progress 📈
                    </h3>
                    <div className="space-y-3">
                      {debateAnalysis.userDebateSkills.map((skill, index) => (
                        <div key={index} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-gray-800 dark:text-gray-200">{skill.skill}</span>
                            <div className="flex items-center">
                              <span className={`text-sm font-bold ${
                                skill.rating >= 8 ? 'text-green-600 dark:text-green-400' :
                                skill.rating >= 6 ? 'text-blue-600 dark:text-blue-400' :
                                'text-indigo-600 dark:text-indigo-400'
                              }`}>
                                {skill.rating}/10
                              </span>
                              <div className="ml-2 bg-gray-200 dark:bg-gray-600 h-2 w-16 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    skill.rating >= 8 ? 'bg-green-500' :
                                    skill.rating >= 6 ? 'bg-blue-500' :
                                    'bg-indigo-500'
                                  }`}
                                  style={{ width: `${(skill.rating / 10) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{skill.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Improvement Suggestions */}
                  <div>
                    <h3 className="font-medium text-lg text-gray-800 dark:text-gray-200 mb-2">
                      Next Steps for Improvement 🎯
                    </h3>
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Try these specific strategies in your next debate:
                      </p>
                      <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                        {debateAnalysis.improvementSuggestions.map((suggestion, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-indigo-500 font-bold mt-0.5">•</span>
                            <span>{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Default Guide Content */}
                  {/* Debate stage info */}
                  <div className="mb-4">
                    <h3 className="font-medium text-lg text-gray-800 dark:text-gray-200 mb-2">
                      Current Stage
                    </h3>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                        <div className="bg-blue-200 dark:bg-blue-800 rounded-full p-1">
                          <Check size={16} />
                        </div>
                        <p className="font-medium">{debateStage.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase())}</p>
                      </div>
                      <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
                        {getStageInstructions()}
                      </p>
                    </div>
                  </div>
                  
                  {/* Debate structure */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-medium text-lg text-gray-800 dark:text-gray-200">
                        Debate Structure
                      </h3>
                      <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" onClick={() => setShowTips(!showTips)}>
                        {showTips ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                    
                    {showTips && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2 mb-3"
                      >
                        <div className={`p-3 rounded-lg border ${debateStage === 'opening_statement' ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-900/30' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700'}`}>
                          <p className="font-medium text-sm">Opening Statement</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">Share your main points clearly and confidently</p>
                        </div>
                        
                        <div className={`p-3 rounded-lg border ${debateStage === 'rebuttal' ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-900/30' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700'}`}>
                          <p className="font-medium text-sm">Rebuttal</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">Address opposing arguments thoughtfully</p>
                        </div>
                        
                        <div className={`p-3 rounded-lg border ${debateStage === 'closing_statement' ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-900/30' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700'}`}>
                          <p className="font-medium text-sm">Closing Statement</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">Wrap up your strongest points with confidence</p>
                        </div>
                        
                        <div className={`p-3 rounded-lg border ${debateStage === 'conclusion' ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-900/30' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700'}`}>
                          <p className="font-medium text-sm">Conclusion & Analysis</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">Debate ends with detailed feedback and analysis</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                  
                  {/* Tips section */}
                  <div>
                    <h3 className="font-medium text-lg text-gray-800 dark:text-gray-200 mb-2">
                      Debate Tips
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                      <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500">💡</span>
                          <span>Take your time to organize your thoughts before responding</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500">🎯</span>
                          <span>Use evidence and examples to support your arguments</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500">🤝</span>
                          <span>Stay respectful, even when disagreeing with the other side</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500">📝</span>
                          <span>Practice active listening and address specific points</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500">🌱</span>
                          <span>Remember, improvement comes with practice - don't be afraid to make mistakes!</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Bottom action */}
            {debateStage === 'conclusion' && (
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-900/30">
                <button 
                  onClick={resetDebate}
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                >
                  Start New Debate
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="mt-auto pt-8">
        <div className="max-w-6xl mx-auto px-4 py-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              © {new Date().getFullYear()} Debate Arena. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link to="/" className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                Home
              </Link>
              <Link to="/chat" className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                Debate
              </Link>
              <Link to="/journey" className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                Journey
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Debate;