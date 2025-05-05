import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

// Define EQ categories for structured analysis
const EQ_CATEGORIES = [
  { name: 'Self-awareness', weight: 0.25 },
  { name: 'Emotional expression', weight: 0.20 },
  { name: 'Empathy', weight: 0.25 },
  { name: 'Self-regulation', weight: 0.15 },
  { name: 'Social awareness', weight: 0.15 }
];

// Define foundation questions for structured conversation
const FOUNDATION_QUESTIONS = [
  {
    id: 'current_feelings',
    question: "How are you feeling right now? Try to be specific about your emotions.",
    area: 'Self-awareness',
    purpose: 'Gauging current emotional state and emotional vocabulary'
  },
  {
    id: 'emotion_trigger',
    question: "What triggered this feeling? Can you describe a recent situation that affected your emotions?",
    area: 'Emotional awareness',
    purpose: 'Understanding cause-effect in emotional response'
  },
  {
    id: 'body_sensations',
    question: "How does this emotion feel in your body? Where do you notice it physically?",
    area: 'Self-awareness',
    purpose: 'Assessing somatic awareness'
  },
  {
    id: 'reaction_patterns',
    question: "How did you react to this situation? Is this a typical response for you?",
    area: 'Self-regulation',
    purpose: 'Evaluating emotional regulation patterns'
  },
  {
    id: 'others_perspective',
    question: "How might others involved in this situation be feeling? What might their perspective be?",
    area: 'Empathy',
    purpose: 'Measuring perspective-taking ability'
  },
  {
    id: 'emotional_impact',
    question: "How did your emotions impact your decisions or actions in this situation?",
    area: 'Emotional intelligence application',
    purpose: 'Evaluating emotional influence on behavior'
  },
  {
    id: 'improvement_reflection',
    question: "If you could respond differently next time, what would you do?",
    area: 'Growth mindset',
    purpose: 'Assessing adaptability and learning orientation'
  }
];

export interface EQAnalysisResult {
  score: number;
  categoryScores?: Record<string, any>;
  feedback: string;
  responseText: string;
  strengthsAndWeaknesses?: {
    strengths: string[];
    weaknesses: string[];
  };
  emotionalVocabulary?: string[];
  keyInsights?: string[];
}

// New interface for conversation state
export interface ConversationState {
  stage: 'greeting' | 'questions' | 'analysis' | 'feedback';
  currentQuestionIndex: number;
  responses: Record<string, string>;
  analysisResults: EQAnalysisResult | null;
  complete: boolean;
}

// Define the expected structure for analysisData returned from Gemini
interface GeminiAnalysisData {
  categoryScores?: Record<string, {
    score: number;
    comment: string;
    examples: string[];
  }>;
  overallScore?: number;
  strengths?: { area: string; evidence: string }[];
  areas_for_improvement?: { area: string; suggestion: string }[];
  emotional_vocabulary?: string[];
  key_insights?: string[];
  detailed_feedback?: string;
}

/**
 * Configure the Gemini model with appropriate safety settings
 */
const getConfiguredModel = () => {
  return genAI.getGenerativeModel({ 
    model: "gemini-1.5-pro", // Updated from gemini-pro to gemini-1.5-pro
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    }
  });
};

/**
 * Retry mechanism for API calls
 */
const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`API attempt ${attempt + 1}/${maxRetries + 1} failed:`, error);
      
      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError;
};

/**
 * Create a valid analysis response even for short inputs
 */
const createMeaningfulAnalysis = (userMessage: string): EQAnalysisResult => {
  // Extract any emotion words from the input
  const emotionWords = extractEmotionWords(userMessage);
  
  // Basic categorization of sentiment
  const hasPositive = /good|happy|great|positive|excited|motivated/i.test(userMessage);
  const hasNegative = /bad|sad|angry|frustrated|upset|anxious|worried/i.test(userMessage);
  const hasNeedState = /need|want|wish|hope|desire/i.test(userMessage);
  
  // Build a response based on simple pattern matching
  let baseScore = 65; // Default middle score
  if (hasPositive && !hasNegative) baseScore += 10;
  if (hasNegative && !hasPositive) baseScore -= 10;
  
  const strengths = [];
  const weaknesses = [];
  
  if (hasPositive) {
    strengths.push("Positive emotional awareness: You recognize your positive feelings");
  } else {
    weaknesses.push("Emotional awareness: Try to be more specific about how you feel");
  }
  
  if (hasNeedState) {
    strengths.push("Self-awareness: You can identify what you need emotionally");
  } else {
    weaknesses.push("Need identification: Consider reflecting on what would help you emotionally");
  }
  
  // Generate a response based on the content
  let responseText = '';
  if (hasPositive) {
    responseText = `It's great that you're feeling good! Building on positive emotions can be powerful. What specific area of motivation would most help you right now?`;
  } else if (hasNegative) {
    responseText = `I hear that you're facing some challenges. Recognizing your emotions is an important first step. Would you like to explore what might help improve how you're feeling?`;
  } else if (hasNeedState) {
    responseText = `Recognizing what you need is an important aspect of emotional intelligence. Let's explore what specific motivation would be most helpful for you.`;
  } else {
    responseText = `Thank you for sharing. To provide more personalized guidance on emotional intelligence, could you tell me more about how you're feeling and what you'd like to work on?`;
  }
  
  return {
    score: baseScore,
    categoryScores: {
      "Self_Awareness": {
        score: hasPositive || hasNegative ? 70 : 60,
        comment: "Your response shows some emotional awareness, but could benefit from more specific emotion words.",
        examples: emotionWords.length > 0 ? emotionWords : ["No specific emotion words detected"]
      },
      "Emotional_Expression": {
        score: emotionWords.length > 0 ? 65 : 55,
        comment: "Your expression is straightforward but could use more emotional depth.",
        examples: [userMessage]
      },
      "Self_Regulation": {
        score: 70,
        comment: "Seeking motivation shows a desire for emotional management.",
        examples: ["Expressed need for motivation"]
      },
      "Empathy": {
        score: 60,
        comment: "Not enough context to evaluate empathy fully.",
        examples: ["More interaction needed to assess"]
      },
      "Social_Awareness": {
        score: 60,
        comment: "Limited context to evaluate social awareness.",
        examples: ["More context needed"]
      }
    },
    feedback: `Your brief response shows you can identify how you feel and what you need. For better emotional intelligence development, try to be more specific about your emotions and connect them to your needs. For example, instead of "feeling good," specify if you're feeling "contented," "energized," or "hopeful" and why those specific feelings lead to needing motivation.`,
    responseText: responseText,
    strengthsAndWeaknesses: {
      strengths: strengths.length > 0 ? strengths : ["Basic emotional awareness"],
      weaknesses: weaknesses.length > 0 ? weaknesses : ["Try to express your emotions with more detail"]
    },
    emotionalVocabulary: emotionWords,
    keyInsights: [
      "You can identify your basic emotional state",
      "You recognize when you need external support",
      "Your emotional expression could benefit from more specific language"
    ]
  };
};

/**
 * Extract emotion words from text
 */
const extractEmotionWords = (text: string): string[] => {
  const commonEmotionWords = [
    'happy', 'sad', 'angry', 'frustrated', 'afraid', 'anxious', 'excited', 
    'content', 'upset', 'surprised', 'disgusted', 'bored', 'confused',
    'proud', 'ashamed', 'guilty', 'jealous', 'envious', 'grateful', 'hopeful',
    'disappointed', 'embarrassed', 'satisfied', 'lonely', 'loved', 'calm',
    'stressed', 'overwhelmed', 'relaxed', 'irritated', 'joyful', 'depressed',
    'motivated', 'unmotivated', 'confident', 'insecure', 'optimistic', 'pessimistic',
    'good', 'bad', 'worried', 'relieved', 'enthusiastic', 'apathetic'
  ];
  
  const words = text.toLowerCase().match(/\b(\w+)\b/g) || [];
  return words.filter(word => commonEmotionWords.includes(word));
};

/**
 * Analyze the emotional intelligence indicators in a user's response
 */
export const analyzeEmotionalResponse = async (userMessage: string): Promise<EQAnalysisResult> => {
  try {
    // For very short responses, use our custom analysis instead of calling the API
    if (!userMessage || userMessage.trim().length < 15) {
      console.log("Using local analysis for short message");
      return createMeaningfulAnalysis(userMessage);
    }
    
    const model = getConfiguredModel();
    
    // Using a more detailed prompt for better analysis
    const analysisPrompt = `
      As an expert emotional intelligence coach, analyze this response in detail:
      "${userMessage}"
      
      Provide a comprehensive emotional intelligence analysis using this structured format:
      {
        "categoryScores": {
          "Self_Awareness": {
            "score": <0-100>,
            "comment": "Detailed evaluation of emotional self-awareness",
            "examples": ["specific examples from their response"]
          },
          "Emotional_Expression": {
            "score": <0-100>,
            "comment": "Analysis of how clearly they express emotions",
            "examples": ["specific phrases showing emotional expression"]
          },
          "Empathy": {
            "score": <0-100>,
            "comment": "Evaluation of empathy shown",
            "examples": ["evidence of empathetic understanding"]
          },
          "Self_Regulation": {
            "score": <0-100>,
            "comment": "Assessment of emotional management",
            "examples": ["examples of self-regulation"]
          },
          "Social_Awareness": {
            "score": <0-100>,
            "comment": "Analysis of social/contextual awareness",
            "examples": ["instances of social awareness"]
          }
        },
        "overallScore": <0-100>,
        "strengths": [
          {
            "area": "specific strength area",
            "evidence": "specific example from response"
          }
        ],
        "areas_for_improvement": [
          {
            "area": "specific area to improve",
            "suggestion": "specific, actionable suggestion"
          }
        ],
        "emotional_vocabulary": ["list of emotion words used"],
        "key_insights": ["2-3 main observations about their EQ"],
        "detailed_feedback": "2-3 sentences of specific, constructive feedback"
      }

      Even for short responses, provide detailed analysis based on the limited context.
      If the response is brief, extrapolate what you can about their emotional awareness,
      expression patterns, and potential areas for growth.
      
      Only include JSON in your response, nothing else.
    `;
    
    const analysisResult = await withRetry(async () => {
      const result = await model.generateContent(analysisPrompt);
      const response = await result.response;
      return response.text();
    });
    
    // Extract and parse JSON response
    let jsonMatch = analysisResult.match(/\{[\s\S]*\}/);
    let analysisData: GeminiAnalysisData = {};
    
    if (jsonMatch) {
      try {
        analysisData = JSON.parse(jsonMatch[0]);
        console.log("Successfully parsed analysis JSON");
      } catch (e) {
        console.error('Failed to parse analysis JSON:', e);
        // Fall back to our custom analysis
        return createMeaningfulAnalysis(userMessage);
      }
    } else {
      console.warn("No JSON found in analysis result");
      return createMeaningfulAnalysis(userMessage);
    }
    
    // Generate a more personalized coaching response based on the analysis
    const coachingPrompt = `
      As an empathetic EQ coach responding to: "${userMessage}"
      
      Using this analysis: ${JSON.stringify(analysisData)}
      
      Create a supportive, growth-oriented response that:
      1. Acknowledges their emotional state
      2. Highlights one specific strength with an example
      3. Offers one concrete suggestion for growth
      4. Encourages continued emotional exploration
      5. Uses warm, supportive language
      
      Keep the response under 3 sentences but make it meaningful and specific.
    `;
    
    const responseText = await withRetry(async () => {
      const coachingResult = await model.generateContent(coachingPrompt);
      const coachingResponse = await coachingResult.response;
      return coachingResponse.text();
    });
    
    // Prepare the full analysis result
    const result: EQAnalysisResult = {
      score: analysisData.overallScore || 65,
      categoryScores: {},
      feedback: analysisData.detailed_feedback || 'Analysis pending. Please try again.',
      responseText: responseText || "I notice you're seeking motivation while in a positive state. Consider reflecting on what specifically would energize you and why that matters to you right now.",
      strengthsAndWeaknesses: {
        strengths: analysisData.strengths?.map(s => `${s.area}: ${s.evidence}`) || [],
        weaknesses: analysisData.areas_for_improvement?.map(a => `${a.area}: ${a.suggestion}`) || []
      },
      emotionalVocabulary: analysisData.emotional_vocabulary || extractEmotionWords(userMessage),
      keyInsights: analysisData.key_insights || []
    };
    
    // Process category scores
    if (analysisData.categoryScores) {
      Object.entries(analysisData.categoryScores).forEach(([category, data]) => {
        result.categoryScores![category] = {
          score: data.score,
          comment: data.comment,
          examples: data.examples
        };
      });
    }
    
    return result;
    
  } catch (error) {
    console.error('Error analyzing emotional response:', error);
    // In case of any error, fall back to our custom analysis
    return createMeaningfulAnalysis(userMessage);
  }
};

/**
 * Create a new conversation state with initial values
 */
export const createConversationState = (): ConversationState => {
  return {
    stage: 'greeting',
    currentQuestionIndex: -1,
    responses: {},
    analysisResults: null,
    complete: false
  };
};

/**
 * Get the next message in the conversation flow
 */
export const getNextMessage = (state: ConversationState, userMessage?: string): { message: string, updatedState: ConversationState } => {
  // Make a copy of the state to modify
  const updatedState = { ...state };
  
  // If user provided a message and we're in questions stage, record it
  if (userMessage && state.stage === 'questions' && state.currentQuestionIndex >= 0) {
    const currentQuestionId = FOUNDATION_QUESTIONS[state.currentQuestionIndex].id;
    updatedState.responses = { 
      ...updatedState.responses, 
      [currentQuestionId]: userMessage 
    };
  }

  // Handle different stages
  switch (state.stage) {
    case 'greeting':
      // Move to questions stage
      updatedState.stage = 'questions';
      updatedState.currentQuestionIndex = 0;
      return {
        message: "Hello! I'm your EQ Coach. I'll help you develop your emotional intelligence through some reflective questions. " + 
                 FOUNDATION_QUESTIONS[0].question,
        updatedState
      };
      
    case 'questions':
      // Move to the next question or to analysis
      if (state.currentQuestionIndex < FOUNDATION_QUESTIONS.length - 1) {
        updatedState.currentQuestionIndex += 1;
        return {
          message: FOUNDATION_QUESTIONS[updatedState.currentQuestionIndex].question,
          updatedState
        };
      } else {
        updatedState.stage = 'analysis';
        return {
          message: "Thank you for sharing. I'm analyzing your responses to provide some insights on your emotional intelligence...",
          updatedState
        };
      }
      
    case 'analysis':
      // Perform analysis and move to feedback stage
      updatedState.stage = 'feedback';
      return {
        message: "Analysis complete. Let me share what I've learned about your emotional intelligence...",
        updatedState
      };
      
    case 'feedback':
      // Mark conversation as complete
      updatedState.complete = true;
      return {
        message: "Our conversation is complete. Would you like to start another emotional intelligence exercise?",
        updatedState
      };
      
    default:
      return {
        message: "I'm not sure where we left off. Would you like to start a new conversation?",
        updatedState: createConversationState()
      };
  }
};

/**
 * Analyze all responses collected during the conversation
 */
export const analyzeConversationResponses = async (state: ConversationState): Promise<EQAnalysisResult> => {
  try {
    const model = getConfiguredModel();
    
    // Extract all responses into a single string
    const responsesText = Object.entries(state.responses)
      .map(([questionId, response]) => {
        const question = FOUNDATION_QUESTIONS.find(q => q.id === questionId);
        return `Question: ${question?.question || questionId}\nResponse: ${response}`;
      })
      .join("\n\n");
    
    // Create a comprehensive analysis prompt
    const analysisPrompt = `
      As an expert emotional intelligence coach, analyze these responses to several emotional intelligence questions:
      
      ${responsesText}
      
      Based on these responses, provide a comprehensive emotional intelligence analysis using this structured format:
      {
        "categoryScores": {
          "Self_Awareness": {
            "score": <0-100>,
            "comment": "Detailed evaluation of emotional self-awareness",
            "examples": ["specific examples from their responses"]
          },
          "Emotional_Expression": {
            "score": <0-100>,
            "comment": "Analysis of how clearly they express emotions",
            "examples": ["specific phrases showing emotional expression"]
          },
          "Empathy": {
            "score": <0-100>,
            "comment": "Evaluation of empathy shown",
            "examples": ["evidence of empathetic understanding"]
          },
          "Self_Regulation": {
            "score": <0-100>,
            "comment": "Assessment of emotional management",
            "examples": ["examples of self-regulation"]
          },
          "Social_Awareness": {
            "score": <0-100>,
            "comment": "Analysis of social/contextual awareness",
            "examples": ["instances of social awareness"]
          }
        },
        "overallScore": <0-100>,
        "strengths": [
          {
            "area": "specific strength area",
            "evidence": "specific example from responses"
          }
        ],
        "areas_for_improvement": [
          {
            "area": "specific area to improve",
            "suggestion": "specific, actionable suggestion"
          }
        ],
        "emotional_vocabulary": ["list of emotion words used across all responses"],
        "key_insights": ["3-5 main observations about their overall EQ based on all responses"],
        "detailed_feedback": "3-5 sentences of specific, constructive feedback addressing patterns across all responses"
      }
      
      Only include JSON in your response, nothing else.
    `;
    
    const analysisResult = await withRetry(async () => {
      const result = await model.generateContent(analysisPrompt);
      const response = await result.response;
      return response.text();
    });
    
    // Extract and parse JSON response
    let jsonMatch = analysisResult.match(/\{[\s\S]*\}/);
    let analysisData: GeminiAnalysisData = {};
    
    if (jsonMatch) {
      try {
        analysisData = JSON.parse(jsonMatch[0]);
        console.log("Successfully parsed analysis JSON");
      } catch (e) {
        console.error('Failed to parse analysis JSON:', e);
        // Create a fallback analysis
        return createFallbackAnalysis(state.responses);
      }
    } else {
      console.warn("No JSON found in analysis result");
      return createFallbackAnalysis(state.responses);
    }
    
    // Generate a comprehensive coaching response based on the complete analysis
    const coachingPrompt = `
      As an empathetic EQ coach responding to a completed emotional intelligence assessment.
      
      Using this analysis: ${JSON.stringify(analysisData)}
      
      Create a comprehensive, growth-oriented response that:
      1. Summarizes their overall emotional intelligence profile
      2. Highlights 2-3 specific strengths with examples
      3. Offers 2-3 concrete suggestions for growth in weaker areas
      4. Provides a personalized developmental pathway
      5. Uses warm, supportive language throughout
      
      Make the response feel personalized and actionable, around 3-4 paragraphs.
    `;
    
    const responseText = await withRetry(async () => {
      const coachingResult = await model.generateContent(coachingPrompt);
      const coachingResponse = await coachingResult.response;
      return coachingResponse.text();
    });
    
    // Prepare the full analysis result
    const result: EQAnalysisResult = {
      score: analysisData.overallScore || 65,
      categoryScores: {},
      feedback: analysisData.detailed_feedback || 'Thank you for completing this emotional intelligence exercise.',
      responseText: responseText || "Thank you for sharing your thoughts on these emotional questions. I notice several patterns in how you process and express emotions. Your responses show some strengths in self-awareness, while there may be opportunities to develop your emotional vocabulary further. Consider practicing naming specific emotions when you experience them, and reflect on how they connect to your physical sensations.",
      strengthsAndWeaknesses: {
        strengths: analysisData.strengths?.map(s => `${s.area}: ${s.evidence}`) || [],
        weaknesses: analysisData.areas_for_improvement?.map(a => `${a.area}: ${a.suggestion}`) || []
      },
      emotionalVocabulary: analysisData.emotional_vocabulary || [],
      keyInsights: analysisData.key_insights || []
    };
    
    // Process category scores
    if (analysisData.categoryScores) {
      Object.entries(analysisData.categoryScores).forEach(([category, data]) => {
        result.categoryScores![category] = {
          score: data.score,
          comment: data.comment,
          examples: data.examples
        };
      });
    }
    
    return result;
    
  } catch (error) {
    console.error('Error analyzing conversation responses:', error);
    // In case of any error, fall back to a basic analysis
    return createFallbackAnalysis(state.responses);
  }
};

/**
 * Create a fallback analysis when the main analysis fails
 */
const createFallbackAnalysis = (responses: Record<string, string>): EQAnalysisResult => {
  // Combine all responses
  const allText = Object.values(responses).join(' ');
  
  // Extract emotion words
  const emotionWords = extractEmotionWords(allText);
  const emotionCount = emotionWords.length;
  
  // Calculate basic metrics
  const wordCount = allText.split(/\s+/).length;
  const avgWordsPerResponse = wordCount / Math.max(1, Object.keys(responses).length);
  
  // Determine base scores
  const selfAwarenessScore = Math.min(100, 50 + emotionCount * 5);
  const expressionScore = Math.min(100, 50 + (avgWordsPerResponse / 20) * 10);
  
  return {
    score: Math.round((selfAwarenessScore + expressionScore) / 2),
    categoryScores: {
      "Self_Awareness": {
        score: selfAwarenessScore,
        comment: "Based on emotional vocabulary used across responses",
        examples: emotionWords.slice(0, 3)
      },
      "Emotional_Expression": {
        score: expressionScore,
        comment: "Based on detail and length of responses",
        examples: ["Used approximately " + avgWordsPerResponse.toFixed(1) + " words per response"]
      },
      "Empathy": {
        score: 60,
        comment: "Limited context for full assessment",
        examples: ["Need more interpersonal context to assess"]
      },
      "Self_Regulation": {
        score: 65,
        comment: "Shows willingness to engage in emotional reflection",
        examples: ["Completed multiple emotional intelligence questions"]
      },
      "Social_Awareness": {
        score: 60,
        comment: "Limited social context for assessment",
        examples: ["Need more interpersonal examples to assess"]
      }
    },
    feedback: `Thank you for completing this emotional intelligence exercise. You've shown a willingness to reflect on your emotions, which is foundational for EQ growth. Consider exploring your emotions in more depth by using a broader emotional vocabulary and connecting emotions to physical sensations and specific situations.`,
    responseText: `Based on your responses, I notice you're engaged with the emotional intelligence process, which is excellent. Your use of ${emotionCount} emotion-related words shows awareness of your feelings. To further develop your EQ, try expanding your emotional vocabulary beyond basic terms like "good" or "bad" to more specific states like "fulfilled," "apprehensive," or "fascinated." This nuanced awareness can help you better understand and navigate your emotional landscape.`,
    strengthsAndWeaknesses: {
      strengths: ["Self-reflection: Willingness to examine emotions", "Engagement: Completed the emotional intelligence exercise"],
      weaknesses: ["Emotional vocabulary: Could benefit from more specific emotion terms", "Emotional depth: Consider exploring the connections between emotions, thoughts, and behaviors"]
    },
    emotionalVocabulary: emotionWords,
    keyInsights: [
      "Shows willingness to engage in emotional exercises",
      "Could benefit from expanded emotional vocabulary",
      "Demonstrates basic self-reflection capabilities"
    ]
  };
};

export const getInitialGreeting = (): string => {
  return "Hello! I'm your EQ Coach. I'm here to help you develop your emotional intelligence through our conversations. I'll ask you a series of questions to understand your emotional patterns better. Ready to begin?";
};

export default {
  analyzeEmotionalResponse,
  getInitialGreeting,
  createConversationState,
  getNextMessage,
  analyzeConversationResponses
};