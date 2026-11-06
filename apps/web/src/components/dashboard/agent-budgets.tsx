import type { AgentView } from "@agentmeter/shared/src/schemas";
import { money, budgetUsage } from "@/lib/format";
export function AgentBudgets({
  agents,
  loading,
}: {
  agents: AgentView[];
  loading: boolean;
}) {
  return (
    <section className="list-panel">
      <div className="section-heading">
        <h2>Daily budgets</h2>
        <span className="muted">Caps enforced by the gateway</span>
      </div>
      {agents.map((a) => {
        const { percentage, bar, over, remaining, zeroCap } = budgetUsage(
          a.spentToday,
          a.dailyCap,
        );
        return (
          <div className="agent-row" key={a.id}>
            <div>
              <h3>{a.name}</h3>
              <code>{a.hederaAccountId}</code>
            </div>
            <div>
              <div className="budget-label">
                <span>{money(a.spentToday, a.asset)}</span>
                <span>of {money(a.dailyCap, a.asset)}</span>
              </div>
              <progress
                className={percentage >= 80 ? "warning" : ""}
                max={100}
                value={bar}
                aria-label={`${a.name} daily budget used`}
              />
              <small>
                {zeroCap
                  ? "No daily budget allocated"
                  : `${percentage}% used · ${money(remaining, a.asset)} remaining`}
                {over && " · Cap exceeded"}
              </small>
            </div>
          </div>
        );
      })}
      {!loading && !agents.length && (
        <div className="empty">No registered agents.</div>
      )}
      {loading && !agents.length && (
        <div className="empty" role="status">
          Loading agent budgets…
        </div>
      )}
    </section>
  );
}
