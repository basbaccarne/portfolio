import type { Data, Assignment, Person, Project, Phd } from './store'

// Fictional demo data, shaped like the "General GANTT" sheet:
// projects with a span, people allocated in person-months per quarter.
const Q = (year: number, quarter: number) => year * 4 + quarter - 1

export function seed(): Data {
  const person = (id: string, name: string, capacity = 3, start: number | null = null, extra: Partial<Person> = {}): Person =>
    ({ id, name, capacity, start, end: null, base: 0, teaching: [0, 0, 0, 0], ...extra })

  const people: Person[] = [
    person('per_anna', 'Anna De Smet'),
    // Partly paid by the faculty, teaches in both semesters (Q4, and Q1-Q2).
    person('per_jonas', 'Jonas Peeters', 3, null, { base: 1, teaching: [0.5, 0.5, 0, 0.5] }),
    person('per_lotte', 'Lotte Maes'),
    person('per_milan', 'Milan Claes'),
    person('per_nora', 'Nora Willems'),
    person('per_ruben', 'Ruben Jacobs', 2.4), // 80%
    person('per_elise', 'Elise Vermeulen', 1.5), // 50%
    person('per_tom', 'Tom Goossens', 3, Q(2026, 2)),
    // 80% paid by the faculty: 20% still needs project funding, but she can work on projects within the 80%.
    person('per_sara', 'Sara Mertens', 3, null, { base: 2.4, teaching: [0.6, 0.6, 0, 0.6] }),
  ]

  const ms = (id: string, title: string, date: string) => ({ id, title, date })
  const projects: Project[] = [
    { id: 'prj_civic', name: 'Civic Data Spaces', org: 'UGent', funder: 'Digital Europe', color: 3, start: Q(2025, 1), end: Q(2027, 4),
      milestones: [ms('m1', 'Interim report', '2026-06-30'), ms('m2', 'Final review', '2027-11-20')] },
    { id: 'prj_urban', name: 'Urban Futures Lab', org: 'UGent', funder: 'VLAIO', color: 0, start: Q(2026, 1), end: Q(2028, 4),
      milestones: [ms('m3', 'Kick-off', '2026-02-10'), ms('m4', 'Mid-term review', '2027-06-15'), ms('m5', 'Final report', '2028-11-30')] },
    { id: 'prj_museum', name: 'Museum Next', org: 'UGent', funder: 'City of Ghent', color: 1, start: Q(2026, 1), end: Q(2026, 2),
      milestones: [ms('m6', 'Exhibition opening', '2026-05-22')] },
    { id: 'prj_waas', name: 'Living Lab Waasland', org: 'imec', funder: 'VLAIO', color: 5, start: Q(2026, 1), end: Q(2026, 4),
      milestones: [ms('m7', 'Panel wave 2', '2026-09-15')] },
    { id: 'prj_care', name: 'CareLoop', org: 'imec', funder: 'Horizon Europe', color: 7, start: Q(2026, 2), end: Q(2029, 1),
      milestones: [ms('m8', 'D2.1 Pilot protocol', '2026-12-15'), ms('m9', 'EC review meeting', '2027-10-05'), ms('m10', 'D5.3 Final report', '2029-02-28')] },
    { id: 'prj_emp', name: 'Empathic AI', org: 'UGent', funder: 'Interreg', color: 4, start: Q(2026, 2), end: Q(2028, 2),
      milestones: [ms('m11', 'Prototype demo', '2027-03-10')] },
    { id: 'prj_text', name: 'TextileShield', org: 'imec', funder: 'EDF', color: 2, start: Q(2026, 2), end: Q(2029, 1),
      milestones: [ms('m12', 'Field trial', '2027-09-01')] },
    { id: 'prj_phd_lotte', name: 'PhD Lotte', org: 'UGent', funder: 'BOF', color: 6, start: Q(2025, 4), end: Q(2029, 3),
      milestones: [ms('m13', 'Doctoral committee', '2027-03-20'), ms('m14', 'Defence', '2029-09-12')] },
    { id: 'prj_phd_nora', name: 'PhD Nora', org: 'UGent', funder: 'FWO', color: 8, start: Q(2026, 1), end: Q(2029, 4),
      milestones: [ms('m15', 'Doctoral committee', '2027-05-18')] },
    { id: 'prj_comob', name: 'Co-Mobility', org: 'UGent', funder: 'FWO SBO · proposal', color: 9, start: Q(2027, 1), end: Q(2029, 4),
      milestones: [] },
  ]

  // What each project committed to deliver, in PM per quarter over its whole run.
  const promise = (id: string, pm: number) => {
    const p = projects.find(x => x.id === id)!
    p.promised = {}
    for (let q = p.start; q <= p.end; q++) p.promised[q] = pm
  }
  promise('prj_civic', 3); promise('prj_urban', 3); promise('prj_museum', 1.5); promise('prj_waas', 2)
  promise('prj_care', 3); promise('prj_emp', 2.5); promise('prj_text', 3)
  promise('prj_phd_lotte', 3); promise('prj_phd_nora', 3); promise('prj_comob', 2.5)

  const assignments: Assignment[] = []
  const alloc = (projectId: string, personId: string, from: number, to: number, pm: number) => {
    let a = assignments.find(x => x.projectId === projectId && x.personId === personId)
    if (!a) assignments.push(a = { id: `a_${assignments.length}`, projectId, personId, pm: {} })
    for (let q = from; q <= to; q++) a.pm[q] = pm
  }

  alloc('prj_civic', 'per_anna', Q(2025, 1), Q(2027, 4), 1)
  alloc('prj_civic', 'per_jonas', Q(2025, 1), Q(2027, 4), 1)
  alloc('prj_civic', 'per_ruben', Q(2026, 1), Q(2027, 4), 1)

  alloc('prj_urban', 'per_anna', Q(2026, 1), Q(2028, 4), 1)
  alloc('prj_urban', 'per_milan', Q(2026, 2), Q(2027, 4), 1.5)
  alloc('prj_urban', 'per_elise', Q(2026, 1), Q(2028, 4), 0.5)

  alloc('prj_museum', 'per_milan', Q(2026, 1), Q(2026, 2), 1)
  alloc('prj_museum', 'per_ruben', Q(2026, 1), Q(2026, 2), 0.5)

  alloc('prj_waas', 'per_ruben', Q(2026, 1), Q(2026, 4), 1)
  alloc('prj_waas', 'per_sara', Q(2026, 1), Q(2026, 4), 0.5)
  alloc('prj_waas', 'per_milan', Q(2026, 3), Q(2026, 4), 0.5)

  alloc('prj_care', 'per_jonas', Q(2026, 2), Q(2029, 1), 1.5)
  alloc('prj_care', 'per_sara', Q(2026, 2), Q(2029, 1), 1)
  alloc('prj_care', 'per_elise', Q(2026, 2), Q(2027, 4), 0.5)

  alloc('prj_emp', 'per_anna', Q(2026, 2), Q(2027, 2), 1.5)
  alloc('prj_emp', 'per_lotte', Q(2026, 3), Q(2027, 1), 0.5)
  alloc('prj_emp', 'per_sara', Q(2026, 2), Q(2028, 2), 0.5)

  alloc('prj_text', 'per_tom', Q(2026, 2), Q(2029, 1), 3)
  alloc('prj_phd_lotte', 'per_lotte', Q(2025, 4), Q(2029, 3), 3)
  alloc('prj_phd_nora', 'per_nora', Q(2026, 1), Q(2029, 4), 3)

  alloc('prj_comob', 'per_jonas', Q(2027, 1), Q(2029, 4), 1)
  alloc('prj_comob', 'per_milan', Q(2028, 1), Q(2029, 4), 1.5)

  // Where funding is not the same as the plan.
  const fund = (projectId: string, personId: string, from: number, to: number, pm: number) => {
    const a = assignments.find(x => x.projectId === projectId && x.personId === personId)!
    a.funded ??= {}
    for (let q = from; q <= to; q++) a.funded[q] = pm
  }
  // Lotte's work on Empathic AI is part of her PhD research: it counts for the project, not on top of her PhD time.
  assignments.find(a => a.projectId === 'prj_emp' && a.personId === 'per_lotte')!.overlap = true
  fund('prj_emp', 'per_sara', Q(2026, 2), Q(2028, 2), 0) // works here inside her faculty-paid time
  fund('prj_waas', 'per_sara', Q(2026, 1), Q(2026, 4), 0)
  fund('prj_care', 'per_sara', Q(2026, 2), Q(2029, 1), 0.6) // CareLoop covers her remaining 20%
  fund('prj_civic', 'per_jonas', Q(2025, 1), Q(2027, 4), 0.5)

  // Days actually worked: this year up to two months ago, close to the plan but not identical.
  const now = new Date(), thisMonth = now.getFullYear() * 12 + now.getMonth()
  assignments.forEach((a, i) => {
    for (let m = now.getFullYear() * 12; m <= thisMonth - 2; m++) {
      const planned = ((a.pm[Math.floor(m / 3)] || 0) / 3) * 17.5
      if (!planned) continue
      const wobble = (((i * 7 + m * 3) % 5) - 2) * 0.5
      const d = Math.max(0, Math.round((planned + wobble) * 2) / 2)
      if (d) (a.actual ??= {})[m] = d
    }
  })

  const phds: Phd[] = [
    { id: 'phd_lotte', personId: 'per_lotte', title: 'Designing for civic trust in data spaces', start: Q(2025, 4), end: Q(2029, 3),
      milestones: [
        { id: 'pm1', title: 'Research proposal approved', date: '2026-03-15', done: true },
        { id: 'pm2', title: 'First paper submitted', date: '2026-10-01', done: true },
        { id: 'pm3', title: 'Doctoral committee', date: '2027-03-20' },
        { id: 'pm4', title: 'Defence', date: '2029-09-12' },
      ],
      chapters: [
        { id: 'c1', title: 'Literature review', status: 'finished' },
        { id: 'c2', title: 'Study 1: citizen panels', status: 'in_progress' },
        { id: 'c3', title: 'Study 2: field experiment', status: 'not_started' },
        { id: 'c4', title: 'Design framework', status: 'not_started' },
      ] },
    { id: 'phd_nora', personId: 'per_nora', title: 'Empathy measures for conversational AI', start: Q(2026, 1), end: Q(2029, 4),
      milestones: [
        { id: 'pm5', title: 'Research proposal approved', date: '2026-06-30', done: true },
        { id: 'pm6', title: 'First paper submitted', date: '2026-10-15' },
        { id: 'pm7', title: 'Doctoral committee', date: '2027-05-18' },
      ],
      chapters: [
        { id: 'c5', title: 'Systematic review', status: 'in_progress' },
        { id: 'c6', title: 'Scale development', status: 'not_started' },
        { id: 'c7', title: 'Validation study', status: 'not_started' },
      ] },
    { id: 'phd_tom', personId: 'per_tom', title: 'Adaptive camouflage textiles in the field', start: Q(2026, 2), end: Q(2030, 1),
      milestones: [
        { id: 'pm8', title: 'Research proposal approved', date: '2026-11-30' },
        { id: 'pm9', title: 'Doctoral committee', date: '2027-09-10' },
      ],
      chapters: [
        { id: 'c8', title: 'State of the art', status: 'in_progress' },
        { id: 'c9', title: 'Field trial design', status: 'not_started' },
      ] },
  ]

  return { people, projects, assignments, phds }
}
