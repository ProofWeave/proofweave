import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Edit3, Sparkles, FileCheck, Send, RotateCcw, User, ShieldAlert, CheckCircle } from 'lucide-react';
import { api } from '../lib/api';
import { evaluatePromptGuard } from '../lib/taintGuard';

type Tab = 'ai' | 'manual';

interface ModelInfo {
  id: string;
  label: string;
  tier: 'free' | 'pro';
  dailyLimit: number;
  remaining: number;
}

interface AnalysisResult {
  result: string;
  model: string;
  modelLabel: string;
  tier: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  remaining: number;
  dailyLimit: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  /** AI 메시지 전용 */
  meta?: {
    model: string;
    modelLabel: string;
    tier: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    remaining: number;
    dailyLimit: number;
    uploadAllowed: boolean;
  };
  /** 현재 스트리밍 중인지 여부 */
  streaming?: boolean;
  /** Attest 완료된 attestation ID */
  attestedId?: string;
  /** Attest 진행 중 */
  attesting?: boolean;
  /** 원본 프롬프트 (AI 메시지에서 Attest 할 때 사용) */
  promptRef?: string;
}

/* ── StreamingText — word-by-word 렌더링 ──────────────────── */
function StreamingText({
  text,
  onComplete,
}: {
  text: string;
  onComplete: () => void;
}) {
  const [wordCount, setWordCount] = useState(0);
  const words = text.split(/(\s+)/); // 공백도 함께 보존
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setWordCount(0);
    // 단어별로 점진적 표시 — 속도: 30ms/word (매우 빠르고 자연스러운 느낌)
    const speed = 30;
    let current = 0;
    intervalRef.current = setInterval(() => {
      current += 1;
      if (current >= words.length) {
        setWordCount(words.length);
        if (intervalRef.current) clearInterval(intervalRef.current);
        onComplete();
      } else {
        setWordCount(current);
      }
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <>
      {words.slice(0, wordCount).map((w, i) => (
        <span key={i} className={i === wordCount - 1 ? 'streaming-word' : undefined}>
          {w}
        </span>
      ))}
      {wordCount < words.length && <span className="streaming-cursor" />}
    </>
  );
}

/* ── AttestPage ───────────────────────────────────────────── */
export function AttestPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ai');

  // ── Model management ──
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);

  // ── Chat state ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load models ──
  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{ models: ModelInfo[] }>('/ai/models');
        setModels(data.models);
        if (data.models.length > 0) {
          setSelectedModel(data.models[0].id);
        }
      } catch {
        console.warn('[Attest] Failed to load models');
        setModels([{
          id: 'gemini-3-flash-preview',
          label: 'Gemini 3 Flash',
          tier: 'free',
          dailyLimit: 10,
          remaining: 10,
        }]);
        setSelectedModel('gemini-3-flash-preview');
      } finally {
        setModelsLoading(false);
      }
    })();
  }, []);

  const currentModel = models.find((m) => m.id === selectedModel);

  // ── Auto scroll to bottom ──
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── Auto-resize textarea ──
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  // ── Send message (analyze) ──
  const handleSend = async () => {
    if (!prompt.trim() || !selectedModel || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    const sentPrompt = prompt.trim();
    setPrompt('');
    setError(null);
    setLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      // ── Guard Check ──
      let uploadAllowed = true;
      let guardUnavailable = false;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const guard = await evaluatePromptGuard({
            conversationId: crypto.randomUUID(),
            history: [],
            currentPrompt: sentPrompt,
          });
          if (guard) {
            uploadAllowed = guard.blockchain_upload_allowed !== false;
          }
          break;
        } catch (err: unknown) {
          const is404 = err instanceof Error && err.message.includes('404');
          if (is404) {
            guardUnavailable = true;
            break;
          }
          if (attempt === 0) {
            console.warn('[Attest] Guard check failed, retrying...');
          }
        }
      }

      if (guardUnavailable) {
        uploadAllowed = true;
      }

      // ── AI Analyze ──
      const data = await api.post<AnalysisResult>('/ai/analyze', {
        prompt: sentPrompt,
        model: selectedModel,
      });

      // Update model remaining count
      setModels((prev) =>
        prev.map((m) =>
          m.id === selectedModel
            ? { ...m, remaining: data.remaining }
            : m,
        ),
      );

      // Add AI message with streaming flag
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'ai',
        content: data.result,
        timestamp: Date.now(),
        streaming: true,
        promptRef: sentPrompt,
        meta: {
          model: data.model,
          modelLabel: data.modelLabel,
          tier: data.tier,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          estimatedCost: data.estimatedCost,
          remaining: data.remaining,
          dailyLimit: data.dailyLimit,
          uploadAllowed,
        },
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Handle streaming complete ──
  const handleStreamComplete = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, streaming: false } : m,
      ),
    );
  };

  // ── Handle Attest for specific message ──
  const handleAttest = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || msg.role !== 'ai' || !msg.meta || !msg.meta.uploadAllowed) return;

    setMessages((prev) =>
      prev.map((m) => m.id === msgId ? { ...m, attesting: true } : m),
    );

    try {
      const data = await api.post<{ attestationId: string }>('/attest', {
        data: {
          prompt: msg.promptRef,
          result: msg.content,
          model: msg.meta.model,
          inputTokens: msg.meta.inputTokens,
          outputTokens: msg.meta.outputTokens,
        },
        aiModel: msg.meta.model,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, attesting: false, attestedId: data.attestationId }
            : m,
        ),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Attestation failed');
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, attesting: false } : m),
      );
    }
  };

  // ── New chat ──
  const handleNewChat = () => {
    setMessages([]);
    setPrompt('');
    setError(null);
  };

  // ── Enter to send (Shift+Enter for newline) ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Attest</h2>
        <p>AI 분석 결과를 온체인에 등록</p>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => { setActiveTab('ai'); }}
        >
          <Bot size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
          AI 분석
        </button>
        <button
          className={`tab ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => { setActiveTab('manual'); }}
        >
          <Edit3 size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
          수동 등록
        </button>
      </div>

      {activeTab === 'ai' && (
        <div className="chat-container">
          {/* ── Messages Area ── */}
          <div className="chat-messages">
            {messages.length === 0 && !loading && (
              <div className="chat-empty">
                <div className="chat-empty__icon">
                  <Sparkles size={28} />
                </div>
                <h3>AI 분석을 시작하세요</h3>
                <p>
                  프롬프트를 입력하면 AI가 분석 결과를 실시간으로 스트리밍합니다.
                  원하는 결과를 선택하여 온체인에 등록할 수 있습니다.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message chat-message--${msg.role}`}
              >
                <div className="chat-message__avatar">
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="chat-message__bubble">
                  {/* ── Content (streaming or static) ── */}
                  {msg.role === 'ai' && msg.streaming ? (
                    <StreamingText
                      text={msg.content}
                      onComplete={() => handleStreamComplete(msg.id)}
                    />
                  ) : (
                    msg.content
                  )}

                  {/* ── AI Meta + Actions ── */}
                  {msg.role === 'ai' && msg.meta && !msg.streaming && (
                    <>
                      <div className="chat-message__meta">
                        <span className={`badge ${msg.meta.tier === 'pro' ? 'badge-warning' : 'badge-purple'}`}>
                          {msg.meta.modelLabel}
                        </span>
                        <span className="badge badge-info">
                          입력: {msg.meta.inputTokens}
                        </span>
                        <span className="badge badge-info">
                          출력: {msg.meta.outputTokens}
                        </span>
                        <span className="badge badge-success">
                          ${msg.meta.estimatedCost}
                        </span>
                      </div>

                      <div className="chat-message__actions">
                        {msg.attestedId ? (
                          <button className="chat-attest-btn chat-attest-btn--success" disabled>
                            <CheckCircle size={14} />
                            등록 완료
                          </button>
                        ) : (
                          <button
                            className="chat-attest-btn"
                            onClick={() => handleAttest(msg.id)}
                            disabled={msg.attesting || !msg.meta.uploadAllowed}
                          >
                            {msg.attesting ? (
                              <span className="spinner" style={{ width: 14, height: 14 }} />
                            ) : (
                              <FileCheck size={14} />
                            )}
                            {msg.attesting ? 'Attest 중...' : 'Attest'}
                          </button>
                        )}

                        {msg.attestedId && (
                          <span className="badge badge-success font-mono" style={{ fontSize: '0.65rem' }}>
                            ID: {msg.attestedId.slice(0, 12)}…
                          </span>
                        )}

                        {!msg.meta.uploadAllowed && !msg.attestedId && (
                          <div className="chat-guard-warning">
                            <ShieldAlert size={14} />
                            Guard에 의해 업로드가 차단됨
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* ── Loading indicator ── */}
            {loading && (
              <div className="chat-message chat-message--ai">
                <div className="chat-message__avatar">
                  <Bot size={16} />
                </div>
                <div className="chat-message__bubble">
                  <div className="chat-loading-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Error ── */}
          {error && (
            <div
              className="badge badge-error"
              style={{
                display: 'block',
                margin: '0 20px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {error}
            </div>
          )}

          {/* ── Bottom Input Area ── */}
          <div className="chat-input-area">
            <div className="chat-input-row">
              <textarea
                ref={textareaRef}
                placeholder="예: 이더리움 Curve Finance 재진입 공격 사례를 분석해줘"
                value={prompt}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={loading}
              />
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={loading || !prompt.trim() || (currentModel?.remaining ?? 0) <= 0}
                title="전송 (Enter)"
              >
                {loading ? (
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>

            <div className="chat-input-controls">
              <select
                className="chat-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={modelsLoading || loading}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.remaining <= 0}>
                    {m.label} — {m.remaining}/{m.dailyLimit}회
                    {m.tier === 'pro' ? ' ⭐' : ''}
                    {m.remaining <= 0 ? ' (소진)' : ''}
                  </option>
                ))}
              </select>

              {currentModel && (
                <span className={`badge ${currentModel.remaining <= 0 ? 'badge-error' : currentModel.remaining <= 2 ? 'badge-warning' : 'badge-success'}`}>
                  {currentModel.remaining}/{currentModel.dailyLimit}회
                </span>
              )}

              {messages.length > 0 && (
                <button className="chat-new-btn" onClick={handleNewChat}>
                  <RotateCcw size={12} />
                  새 대화
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'manual' && (
        <div className="card">
          <div className="form-group">
            <label className="label">JSON 데이터</label>
            <textarea
              className="input textarea font-mono"
              placeholder='{"title": "분석 보고서", "content": "...", "model": "gpt-4o"}'
              rows={12}
            />
          </div>
          <button className="btn btn-primary" disabled>
            <FileCheck size={16} /> Attest (온체인 등록)
          </button>
          <span className="text-xs text-muted" style={{ marginLeft: 12 }}>
            수동 등록은 Phase C에서 활성화
          </span>
        </div>
      )}
    </>
  );
}
