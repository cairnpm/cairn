export interface FeatureDetailData {
  feature: {
    id: string; title: string; status: string; appetite: string | null; hill_name: string | null
    problem: string; solution: string | null; rabbit_holes: string | null; out_of_bounds: string | null
  }
  feedback: { id: string; content: string; source: string; classification: string }[]
  decisions: { id: string; verdict: string; rationale: string; decided_by: string | null; decided_at: string }[]
  pr_links: { id: string; repo: string; pr_number: number; pr_url: string; status: string }[]
  events: { seq: number; actor: string; summary: string; created_at: string }[]
  attachments: { id: string; filename: string; kind: string }[]
}
