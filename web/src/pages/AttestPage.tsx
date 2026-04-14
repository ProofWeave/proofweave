import { useState, useEffect } from 'react';
import { Bot, Edit3, Sparkles, FileCheck, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { evaluatePromptGuard } from '../lib/taintGuard';

type Tab = 'ai' | 'manual';
type Step = 'input' | 'result' | 'attest';

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

export function AttestPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const [step, setStep] = useState<Step>('input');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [uploadAllowed, setUploadAllowed] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [attestLoading, setAttestLoading] = useState(false);
  const [attestResult, setAttestResult] = useState<string | null>(null);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);

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

  const handleAnalyze = async () => {
    if (!prompt.trim() || !selectedModel) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setUploadAllowed(true);

    try {
      let guard: { blockchain_upload_allowed: boolean } | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          guard = await evaluatePromptGuard({
            conversationId: crypto.randomUUID(),
            history: [],
            currentPrompt: prompt,
          });
          break;
        } catch {
          if (attempt === 0) {
            console.warn('[Attest] Guard check failed, retrying...');
          }
        }
      }
      // fail-close: Guard 실패 시 업로드 차단
      setUploadAllowed(guard ? guard.blockchain_upload_allowed !== false : false);

      const data = await api.post<AnalysisResult>('/ai/analyze', {
        prompt,
        model: selectedModel,
      });
      setResult(data);
      setStep('result');

      setModels((prev) =>
        prev.map((m) =>
          m.id === selectedModel
            ? { ...m, remaining: data.remaining }
            : m,
        ),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAttest = async () => {
    if (!result || uploadAllowed !== true) return;

    setAttestLoading(true);
    try {
      const data = await api.post<{ attestationId: string }>('/attest', {
        data: {
          prompt,
          result: result.result,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
        aiModel: result.model,
      });
      setAttestResult(data.attestationId);
      setStep('attest');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Attestation failed');
    } finally {
      setAttestLoading(false);
    }
  };

  const resetFlow = () => {
    setStep('input');
    setPrompt('');
    setResult(null);
    setUploadAllowed(true);
    setError(null);
    setAttestResult(null);
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
          onClick={() => { setActiveTab('ai'); resetFlow(); }}
        >
          <Bot size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
          AI 분석
        </button>
        <button
          className={`tab ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => { setActiveTab('manual'); resetFlow(); }}
        >
          <Edit3 size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
          수동 등록
        </button>
      </div>

      {activeTab === 'ai' && (() => {
        const stepIdx = step === 'input' ? 0 : step === 'result' ? 1 : 2;
        return (
          <div className="stepper">
            <div className={`stepper-step ${stepIdx === 0 ? 'active' : stepIdx > 0 ? 'done' : ''}`}>
              <div className="stepper-circle">1</div>
              <span>프롬프트 입력</span>
            </div>
            <div className={`stepper-line ${stepIdx > 0 ? 'done' : ''}`} />
            <div className={`stepper-step ${stepIdx === 1 ? 'active' : stepIdx > 1 ? 'done' : ''}`}>
              <div className="stepper-circle">2</div>
              <span>결과 확인</span>
            </div>
            <div className={`stepper-line ${stepIdx > 1 ? 'done' : ''}`} />
            <div className={`stepper-step ${stepIdx === 2 ? 'active' : ''}`}>
              <div className="stepper-circle">3</div>
              <span>온체인 등록</span>
            </div>
          </div>
        );
      })()}

      {activeTab === 'ai' && step === 'input' && (
        <div className="card">
          <div className="form-group">
            <label className="label">
              <Bot size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
              AI 모델 선택
            </label>
            <div style={{ position: 'relative' }}>
              <select
                className="input"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={modelsLoading}
                style={{
                  appearance: 'none',
                  paddingRight: 36,
                  cursor: 'pointer',
                }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.remaining <= 0}>
                    {m.label} — {m.remaining}/{m.dailyLimit}회 남음
                    {m.tier === 'pro' ? ' ⭐' : ''}
                    {m.remaining <= 0 ? ' (소진)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  opacity: 0.5,
                }}
              />
            </div>

            {currentModel && (
              <div className="flex gap-8 mt-8" style={{ flexWrap: 'wrap' }}>
                <span className={`badge ${currentModel.tier === 'pro' ? 'badge-warning' : 'badge-info'}`}>
                  {currentModel.tier === 'pro' ? '⭐ Pro' : '🆓 Free'}
                </span>
                <span className={`badge ${currentModel.remaining <= 0 ? 'badge-error' : currentModel.remaining <= 2 ? 'badge-warning' : 'badge-success'}`}>
                  {currentModel.remaining}/{currentModel.dailyLimit}회 남음
                </span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="label">
              <Sparkles size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
              프롬프트 입력
            </label>
            <textarea
              className="input textarea"
              placeholder="예: 이더리움 Curve Finance 재진입 공격 사례를 분석해줘"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
            />
          </div>

          {error && (
            <div className="badge badge-error" style={{ display: 'block', marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
              {error}
            </div>
          )}

          <div className="flex items-center gap-12">
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={loading || !prompt.trim() || (currentModel?.remaining ?? 0) <= 0}
            >
              {loading ? <span className="spinner" /> : <><Sparkles size={16} /> 분석 실행</>}
            </button>
            <span className="text-xs text-muted">
              {currentModel?.label ?? '모델 로딩 중...'}
            </span>
          </div>
        </div>
      )}

      {activeTab === 'ai' && step === 'result' && result && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">분석 결과</span>
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
              <span className={`badge ${result.tier === 'pro' ? 'badge-warning' : 'badge-purple'}`}>
                {result.modelLabel}
              </span>
              <span className="badge badge-info">
                입력: {result.inputTokens} 토큰
              </span>
              <span className="badge badge-info">
                출력: {result.outputTokens} 토큰
              </span>
              <span className="badge badge-success">
                예상 비용: ${result.estimatedCost}
              </span>
              <span className={`badge ${uploadAllowed ? 'badge-success' : 'badge-error'}`}>
                {uploadAllowed ? '블록체인 업로드 가능' : '블록체인 업로드 차단'}
              </span>
            </div>
          </div>

          <pre
            className="input textarea font-mono"
            style={{
              minHeight: 200,
              maxHeight: 400,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {result.result}
          </pre>

          <div className="mt-24 flex gap-12">
            <button
              className="btn btn-primary"
              onClick={handleAttest}
              disabled={attestLoading || uploadAllowed !== true}
            >
              {attestLoading ? <span className="spinner" /> : <><FileCheck size={16} /> 이 결과를 Attest</>}
            </button>
            <button className="btn btn-secondary" onClick={resetFlow}>
              다시 입력
            </button>
          </div>

          <p className="text-xs text-muted mt-8">
            남은 횟수: {result.remaining}/{result.dailyLimit}회 · {result.modelLabel}
          </p>
        </div>
      )}

      {activeTab === 'ai' && step === 'attest' && (
        <div className="card text-center" style={{ padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8 }}>
            온체인 등록 완료!
          </h3>
          {attestResult && (
            <p className="font-mono text-sm text-secondary" style={{ marginBottom: 24 }}>
              Attestation ID: {attestResult}
            </p>
          )}
          <button className="btn btn-primary" onClick={resetFlow}>
            새 분석 시작
          </button>
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
