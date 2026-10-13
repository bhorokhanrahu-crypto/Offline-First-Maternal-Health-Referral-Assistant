// Deterministic warning rules. NOT clinical guidance yet.
// Verify every rule against WHO / Pakistan-Sindh health guidance, then update GUIDANCE_VERSION and each ref.
// No numeric thresholds are invented here.
const GUIDANCE_VERSION = 'DEMO-UNVERIFIED-0';

const SYMPTOMS = [
  { id: 'bleeding', label: 'Vaginal bleeding' },
  { id: 'convulsions', label: 'Convulsions / fits' },
  { id: 'headache_vision', label: 'Severe headache with blurred vision' },
  { id: 'abd_pain', label: 'Severe abdominal pain' },
  { id: 'breathing', label: 'Difficulty breathing' },
  { id: 'fever', label: 'Fever' },
  { id: 'fetal_movement', label: 'Reduced / absent baby movement' },
  { id: 'waters_broken', label: 'Water broke / leaking fluid' }
];

const URGENT_ACTION = 'Refer to the nearest emergency-capable facility IMMEDIATELY. Do not wait for AI or sync.';
const REVIEW_ACTION = 'Arrange review by a healthcare professional.';
const REF = 'TODO: cite verified guidance (WHO / Sindh)';

const RULES = {
  bleeding: { level: 'urgent', reason: 'Vaginal bleeding recorded', action: URGENT_ACTION },
  convulsions: { level: 'urgent', reason: 'Convulsions recorded', action: URGENT_ACTION },
  headache_vision: { level: 'urgent', reason: 'Severe headache with blurred vision recorded', action: URGENT_ACTION },
  breathing: { level: 'urgent', reason: 'Difficulty breathing recorded', action: URGENT_ACTION },
  abd_pain: { level: 'urgent', reason: 'Severe abdominal pain recorded', action: URGENT_ACTION },
  fetal_movement: { level: 'review', reason: 'Reduced/absent baby movement recorded', action: REVIEW_ACTION },
  fever: { level: 'review', reason: 'Fever recorded', action: REVIEW_ACTION },
  waters_broken: { level: 'review', reason: 'Water breaking/leaking recorded', action: REVIEW_ACTION }
};

function evaluate(symptoms) {
  return symptoms
    .filter(function (s) { return RULES[s]; })
    .map(function (s) { return Object.assign({ ruleId: s, ref: REF }, RULES[s]); })
    .sort(function (a, b) { return (a.level === b.level) ? 0 : (a.level === 'urgent' ? -1 : 1); });
}
