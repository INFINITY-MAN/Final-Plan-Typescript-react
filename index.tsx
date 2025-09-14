import React, { useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";

// --- TYPES AND INTERFACES ---
interface FileState {
  file: File | null;
  base64: string;
}
type AppView = 'landing' | 'results' | 'studyArea';
type ResultsTab = 'analysis' | 'roadmap';
interface AnalysisItem {
  you: string;
  target: string;
  analysis: string;
}
interface AnalysisSection {
  title: string;
  items: Record<string, AnalysisItem>;
}
interface Resource {
  type: string;
  title: string;
  url: string;
}
interface Topic {
  topic_name: string;
  resources: Resource[];
}
interface Subject {
  subject_name: string;
  topics: Topic[];
}
interface Phase {
  phase_name: string;
  subjects: Subject[];
}
interface Roadmap {
  skill: string;
  phases: Phase[];
}
interface ApiResponse {
  analysis: AnalysisSection[];
  roadmaps: Roadmap[];
}

// --- CONSTANTS & HELPERS ---
const MODEL_NAME = 'gemini-2.0-flash'; // <-- Works now
// const MODEL_NAME = 'gemini-2.5-flash'; // <-- Use this when available
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
//... the rest of your constants
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};
const getYouTubeID = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};
const PROMPT = `You are an expert career coach AI. Your task is to perform a highly detailed and granular comparison between a user's resume and a target resume/profile, then generate a comprehensive learning roadmap.

**PART 1: RESUME ANALYSIS**
Compare every section (Education, Skills, Experience, etc.) present in the Target Resume. Within each section, compare items one-by-one. If the user is missing something, explicitly state it is a 'Gap'. For every comparison, provide a concise 'Analysis' with actionable feedback.

**PART 2: SKILL DEVELOPMENT ROADMAP**
Based on the gaps identified, create detailed, multi-phase learning roadmaps for each major skill required.
- Structure: Each roadmap should have Phases (Beginner, Intermediate, Advanced).
- Content: Each phase should contain Subjects, which in turn contain granular Topics.
- Resources: For EVERY topic, provide AT LEAST TWO high-quality, free, and direct-link online resources (e.g., one 'Video', one 'Article'/'Blog'/'Official Docs').

Return a single JSON object adhering to the provided schema. Do not add any extra text or formatting outside the JSON object.`;
const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        analysis: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            item: {
                                type: Type.OBJECT,
                                properties: {
                                    you: { type: Type.STRING },
                                    target: { type: Type.STRING },
                                    analysis: { type: Type.STRING },
                                }
                            }
                        }
                    }
                }
            }
        },
        roadmaps: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    skill: { type: Type.STRING },
                    phases: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                phase_name: { type: Type.STRING },
                                subjects: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            subject_name: { type: Type.STRING },
                                            topics: {
                                                type: Type.ARRAY,
                                                items: {
                                                    type: Type.OBJECT,
                                                    properties: {
                                                        topic_name: { type: Type.STRING },
                                                        resources: {
                                                            type: Type.ARRAY,
                                                            items: {
                                                                type: Type.OBJECT,
                                                                properties: {
                                                                    type: { type: Type.STRING },
                                                                    title: { type: Type.STRING },
                                                                    url: { type: Type.STRING },
                                                                },
                                                                required: ["type", "title", "url"],
                                                            }
                                                        }
                                                    },
                                                    required: ["topic_name", "resources"],
                                                }
                                            }
                                        },
                                        required: ["subject_name", "topics"],
                                    }
                                }
                            },
                            required: ["phase_name", "subjects"],
                        }
                    }
                },
                required: ["skill", "phases"],
            }
        }
    },
    required: ["analysis", "roadmaps"],
};

// --- SUB-COMPONENTS ---

const FileDropZone = ({ onFileSelect, file }: { onFileSelect: (file: File) => void, file: File | null }) => (
  <div className="file-drop-zone" onClick={() => document.getElementById(file ? 'target-file-input' : 'user-file-input')?.click()}>
    <input type="file" id={file ? 'target-file-input' : 'user-file-input'} style={{ display: 'none' }} onChange={(e) => e.target.files && onFileSelect(e.target.files[0])} />
    {file ? <p className="file-name">{file.name}</p> : <p>Drop your file here, or click to select</p>}
  </div>
);

const AnalysisView = ({ analysis }: { analysis: AnalysisSection[] }) => (
  <div className="analysis-view">
    {analysis.map(section => (
      <section key={section.title} className="analysis-section">
        <h2>{section.title}</h2>
        {Object.entries(section.items).map(([key, item]) => (
          <div key={key} className="analysis-item">
            <h3>{key}</h3>
            <ul>
              <li><span>You:</span> {item.you}</li>
              <li><span>Target:</span> {item.target}</li>
            </ul>
            <p className={`analysis-text ${item.analysis.includes('Gap') || item.analysis.includes('Missing') ? 'gap' : item.analysis.includes('Improvement') ? 'improvement' : 'track'}`}>{item.analysis}</p>
          </div>
        ))}
      </section>
    ))}
  </div>
);

const RoadmapView = ({ roadmaps }: { roadmaps: Roadmap[] }) => (
    <div className="roadmap-view">
        {roadmaps.map(roadmap => (
            <div key={roadmap.skill} className="roadmap-skill">
                <details>
                    <summary>{roadmap.skill}</summary>
                    <div className="roadmap-content">
                        {roadmap.phases.map(phase => (
                            <div key={phase.phase_name} className="roadmap-phase">
                                <h3>{phase.phase_name}</h3>
                                {phase.subjects.map(subject => (
                                    <div key={subject.subject_name} className="roadmap-subject">
                                        <h4>{subject.subject_name}</h4>
                                        {subject.topics.map(topic => (
                                            <div key={topic.topic_name}>
                                                <p><strong>{topic.topic_name}</strong></p>
                                                <ul className="resource-list">
                                                {topic.resources.map(res => (
                                                    <li key={res.url} className="resource-item">
                                                    <span className="resource-type">{res.type}</span>
                                                    <a href={res.url} target="_blank" rel="noopener noreferrer">{res.title}</a>
                                                    </li>
                                                ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </details>
            </div>
        ))}
    </div>
);

const ResultsDisplay = ({ data, onEnterStudy }: { data: ApiResponse, onEnterStudy: () => void }) => {
    const [activeTab, setActiveTab] = useState<ResultsTab>('analysis');
    return (
        <div className="container">
            <div className="results-container">
                <div className="results-header">
                    <div className="tabs">
                        <button className={`tab ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>Resume Analysis</button>
                        <button className={`tab ${activeTab === 'roadmap' ? 'active' : ''}`} onClick={() => setActiveTab('roadmap')}>Skill Roadmaps</button>
                    </div>
                    <button className="study-cta" onClick={onEnterStudy}>🚀 Enter Study Area</button>
                </div>
                {activeTab === 'analysis' ? <AnalysisView analysis={data.analysis} /> : <RoadmapView roadmaps={data.roadmaps} />}
            </div>
        </div>
    );
};

const MainStudyArea = ({ roadmap, onExit }: { roadmap: Roadmap[], onExit: () => void }) => {
    const flatTopics = useMemo(() => roadmap.flatMap(skill => skill.phases.flatMap(phase => phase.subjects.flatMap(subject => subject.topics.map(topic => ({ ...topic, skill: skill.skill, subject: subject.subject_name }))))), [roadmap]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const currentTopic = flatTopics[currentIndex];

    const classmates = [{ name: 'Alex', msg: "Oh, cool topic! I was just wondering how this fits into the bigger picture." }, { name: 'Ben', msg: "I've heard this part can be tricky. Let's make sure we get the fundamentals down!" }, { name: 'Chloe', msg: "Yes! I've been waiting to learn about this. So excited!" }];
    
    return (
        <div className="study-area">
            <aside className="study-sidebar">
                <h2>AI CLASSMATES</h2>
                <div className="classmate-message">
                    <div className="classmate-name">{classmates[currentIndex % 3].name}</div>
                    <p>{classmates[currentIndex % 3].msg}</p>
                </div>
            </aside>
            <main className="study-chat-view">
                <div className="study-content">
                    <div className="ai-message">
                        Alright, let's take the next small step on your path! Time to focus on <strong>{currentTopic.topic_name}</strong> within {currentTopic.subject}. This is a key building block for mastering {currentTopic.skill}. No pressure, just focus on understanding the core idea.
                    </div>
                    {currentTopic.resources.map(res => {
                        const videoId = res.type === 'Video' ? getYouTubeID(res.url) : null;
                        return (
                            <div key={res.url} className="resource-embed">
                                <div className="resource-embed-header">{res.type}: {res.title}</div>
                                {videoId ? (
                                    <div className="video-container">
                                        <iframe src={`https://www.youtube.com/embed/${videoId}`} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={res.title}></iframe>
                                    </div>
                                ) : (
                                    <div style={{padding: '1rem'}}>
                                        <a href={res.url} target="_blank" rel="noopener noreferrer">Open Article/Blog Post</a>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <nav className="study-nav">
                    <button className="study-nav-button" onClick={() => setCurrentIndex(i => i - 1)} disabled={currentIndex === 0}>Previous</button>
                    <span>{currentIndex + 1} / {flatTopics.length}</span>
                    <button className="study-nav-button" onClick={() => setCurrentIndex(i => i + 1)} disabled={currentIndex === flatTopics.length - 1}>Next Topic</button>
                </nav>
            </main>
            <aside className="study-sidebar">
                <h2>FUTURE SELF</h2>
                <div className="future-message">
                    <div className="future-title">A message from your future self:</div>
                    <p>Every topic you master is a step closer to the career you want. Keep going, you're building something great.</p>
                </div>
                <div className="progress-bar-container">
                    <div className="progress-bar-label">Total Roadmap Progress</div>
                    <div className="progress-bar-bg">
                        <div className="progress-bar-fg" style={{ width: `${((currentIndex + 1) / flatTopics.length) * 100}%` }}></div>
                    </div>
                </div>
                 <button className="study-nav-button exit-study-button" onClick={onExit} style={{marginTop: '1rem'}}>Exit Study Area</button>
            </aside>
        </div>
    );
};


// --- MAIN APP COMPONENT ---

const App = () => {
    const [userResume, setUserResume] = useState<FileState>({ file: null, base64: '' });
    const [targetResume, setTargetResume] = useState<FileState>({ file: null, base64: '' });
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [result, setResult] = useState<ApiResponse | null>(null);
    const [view, setView] = useState<AppView>('landing');
    
    const handleFileSelect = async (file: File, type: 'user' | 'target') => {
        const base64 = await fileToBase64(file);
        if (type === 'user') setUserResume({ file, base64 });
        else setTargetResume({ file, base64 });
    };

    const handleSubmit = async () => {
        if (!userResume.file || !targetResume.file) return;
        setLoading(true);
        setError('');
        setResult(null);

        try {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: MODEL_NAME, // Using the new constant here
                contents: {
                    parts: [
                        { text: PROMPT },
                        { inlineData: { mimeType: userResume.file.type, data: userResume.base64 } },
                        { inlineData: { mimeType: targetResume.file.type, data: targetResume.base64 } },
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: RESPONSE_SCHEMA
                },
            });

            const jsonText = response.text.trim();
            const parsedResult = JSON.parse(jsonText);
            setResult(parsedResult);
            setView('results');
        } catch (e: any) {
            console.error("API Error:", e);
            setError(e.message || 'An unexpected error occurred. Check the console for details.');
        } finally {
            setLoading(false);
        }
    };

    const renderView = () => {
        switch (view) {
            case 'studyArea':
                return result ? <MainStudyArea roadmap={result.roadmaps} onExit={() => setView('results')} /> : null;
            case 'results':
                return result ? <ResultsDisplay data={result} onEnterStudy={() => setView('studyArea')} /> : null;
            case 'landing':
            default:
                return (
                    <div className="landing-container">
                        <h1>ONE <span>PATH</span></h1>
                        <p>Your AI Career Co-Pilot. Upload your resume and a target profile to analyze skill gaps and generate your personalized development roadmap.</p>
                        <div className="upload-area">
                            <FileDropZone onFileSelect={(f) => handleFileSelect(f, 'user')} file={userResume.file} />
                            <FileDropZone onFileSelect={(f) => handleFileSelect(f, 'target')} file={targetResume.file} />
                        </div>
                        <button onClick={handleSubmit} className="main-cta" disabled={loading || !userResume.file || !targetResume.file}>
                            {loading ? 'Analyzing...' : 'Analyze & Build My Path'}
                        </button>
                        {error && <div className="error-message">Error: {error}</div>}
                    </div>
                );
        }
    };
    
    return <>{renderView()}</>;
};

// --- RENDER THE APP ---
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
