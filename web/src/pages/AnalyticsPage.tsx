export function AnalyticsPage() {
  return (
    <>
      <div className="page-header">
        <h2>Cost Analytics</h2>
        <p>AI 분석 비용 절감 지표</p>
      </div>

      <div className="bento-grid">
        <div className="card kpi-card green">
          <div className="card-header">
            <span className="card-title">평균 절감률</span>
          </div>
          <div className="card-value" style={{ color: 'var(--accent-green)' }}>~60%</div>
          <p className="text-xs text-muted mt-4">
            AI 직접 호출 대비 ProofWeave 구매 시
          </p>
        </div>

        <div className="card kpi-card cyan">
          <div className="card-header">
            <span className="card-title">평균 AI 분석 비용</span>
          </div>
          <div className="card-value">$0.025</div>
          <p className="text-xs text-muted mt-4">
            ~2,500 토큰 기준 (입력 500 + 출력 2,000)
          </p>
        </div>

        <div className="card kpi-card purple">
          <div className="card-header">
            <span className="card-title">ProofWeave 구매 비용</span>
          </div>
          <div className="card-value">$0.01</div>
          <p className="text-xs text-muted mt-4">
            검증된 데이터 즉시 접근 (토큰 사용 0)
          </p>
        </div>

        <div className="card kpi-card amber">
          <div className="card-header">
            <span className="card-title">누적 절감액</span>
          </div>
          <div className="card-value">—</div>
          <p className="text-xs text-muted mt-4">
            실사용 로그 기반 (2차 구현 예정)
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">비용 비교 — AI 직접 호출 vs ProofWeave</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>시나리오</th>
                <th>입력 토큰</th>
                <th>출력 토큰</th>
                <th>AI 직접 비용</th>
                <th>PW 구매 비용</th>
                <th>절감</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>간단한 분석</td>
                <td className="mono">~200</td>
                <td className="mono">~800</td>
                <td className="mono">$0.008</td>
                <td className="mono">$0.005</td>
                <td><span className="badge badge-success">37%</span></td>
              </tr>
              <tr>
                <td>상세 보안 감사</td>
                <td className="mono">~500</td>
                <td className="mono">~2,000</td>
                <td className="mono">$0.025</td>
                <td className="mono">$0.01</td>
                <td><span className="badge badge-success">60%</span></td>
              </tr>
              <tr>
                <td>코드 취약점 분석</td>
                <td className="mono">~2,000</td>
                <td className="mono">~5,000</td>
                <td className="mono">$0.075</td>
                <td className="mono">$0.01</td>
                <td><span className="badge badge-success">87%</span></td>
              </tr>
              <tr>
                <td>대규모 데이터 분석</td>
                <td className="mono">~10,000</td>
                <td className="mono">~8,000</td>
                <td className="mono">$0.20</td>
                <td className="mono">$0.01</td>
                <td><span className="badge badge-success">95%</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-16">
          * Gemini 3 Flash 기준 토큰 단가: 입력 $0.10/1M, 출력 $0.40/1M 추정. 실제 비용은 모델과 사용량에 따라 다름.
        </p>
      </div>
    </>
  );
}
