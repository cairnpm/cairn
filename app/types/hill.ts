export interface HillFeature {
  id: string; title: string; status: string
  decision: { verdict: string; rationale: string; decided_by: string | null } | null
  pr_links: { repo: string; pr_number: number; pr_url: string; status: string }[]
  builders: { user_id: string; name: string; avatar_url: string | null }[]
}
export interface HillDetailData {
  hill: { id: string; name: string; starts_at: string | null; ends_at: string | null; status: string; rationale: string | null }
  features: HillFeature[]
  betting_table: { id: string; title: string; validated_by: string | null } | null
}
