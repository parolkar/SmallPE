# Master Request List (MRL) Workflow Guide

## Overview

The Master Request List (MRL) is the central nervous system of SmallPE's due diligence process. It ensures:
- **Complete Coverage:** All necessary information is requested
- **Progress Tracking:** Real-time visibility into diligence status
- **Accountability:** Clear ownership of each request
- **Quality Control:** Systematic review of all received data
- **Evidence Chain:** Direct link from requests to evidence to business evaluation

**Owner:** Athena (Due Diligence Orchestrator)
**Users:** All agents involved in due diligence (Prometheus, Themis, Logos, etc.)

---

## MRL Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     MRL LIFECYCLE                                │
└─────────────────────────────────────────────────────────────────┘

1. SETUP           → 2. REQUEST        → 3. TRACK         → 4. ANALYZE
   ↓                   ↓                   ↓                  ↓
Create MRL from     Send requests      Monitor status     Process data
template            to management      Follow up          Create evidence
Assign owners       Document sends     Update progress    Link to eval
Set priorities      Set deadlines      Escalate blocks    Document findings

                         ↓                                    ↓
                    5. INTEGRATE  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                         ↓
                    Link to business evaluation
                    Support value creation mapping
                    Validate risk assessment
                    Inform investment decision
```

---

## Phase 1: MRL Setup (Day 0-1)

### Athena's Responsibilities

**Step 1.1: Initialize MRL**
- Copy template from `/due-diligence/templates/master-request-list-template.md`
- Name it: `master-request-list-[deal-name].md`
- Store in: `/due-diligence/[deal-name]/`
- Customize for deal type and industry

**Step 1.2: Import Standard Requests**
- Load standard request list (from real-world template)
- Add deal-specific requests based on:
  - Industry sector (e.g., e-gaming, fintech)
  - Business model (B2B, B2C, platform)
  - Regulatory environment (AML/KYC requirements)
  - Deal complexity

**Step 1.3: Assign Request Owners**
```
Request Category              → Primary Owner
────────────────────────────────────────────────────────
Financial statements          → Logos
Revenue & client data         → Prometheus
Cost & capacity analysis      → Logos
Compliance/AML data           → Themis
People & organization         → Prometheus
Legal & contracts             → Themis
General coordination          → Athena
```

**Step 1.4: Set Priorities**
- **High:** Deal-blocking, affects valuation or investment decision
- **Mid:** Important for full understanding, affects risk assessment
- **Low:** Nice to have, background information

**Step 1.5: Create Dashboard**
- Initialize quick dashboard for daily updates
- Set up weekly status report template
- Configure alerts for overdue items

---

## Phase 2: Request Execution (Day 1-3)

### Athena's Responsibilities

**Step 2.1: Package Requests for Management**
- Group requests by category/workstream
- Prioritize and sequence appropriately
- Include clear rationale for each request
- Specify desired format and timeframe
- Send via proper channel (usually through deal lead/seller advisor)

**Step 2.2: Document Request Transmission**
- Update MRL with "Date Requested" for each item
- Note method of transmission
- Set target response dates (typically 3-5 days)
- Schedule follow-up reminders

**Step 2.3: Communicate with Agent Team**
- Share MRL with all agents
- Brief each agent on their assigned requests
- Explain why each request matters
- Set expectations for analysis turnaround
- Establish daily check-in schedule

---

## Phase 3: Progress Tracking (Ongoing)

### Daily Operations

**Morning Routine (Athena)**
1. Review overnight responses from management
2. Update MRL status for received items
3. Assign new data to appropriate agents
4. Update quick dashboard
5. Identify and escalate blocks
6. Send daily brief to team

**Throughout Day (All Agents)**
1. Check MRL for new assignments
2. Process assigned data using excel2md/pdf2md
3. Update MRL with progress
4. Document findings
5. Flag issues or gaps immediately
6. Create evidence IDs (Themis)

**Evening Routine (Athena)**
1. Collect agent updates
2. Update MRL completion status
3. Prepare follow-ups for management
4. Update critical path assessment
5. Brief Managing Partner if needed

### Status Management

**Status Transitions:**
```
Not Started → In Progress → Completed
     ↓            ↓
  Blocked ←  Cancelled
```

**When to Update Status:**
- **→ In Progress:** Request sent OR data received and under analysis
- **→ Completed:** Data analyzed, findings documented, evidence created
- **→ Blocked:** Unable to obtain data or analysis cannot proceed
- **→ Cancelled:** Determined to be unnecessary or redundant

### Follow-Up Protocol

**Day 3:** Gentle reminder if no response
**Day 5:** Formal follow-up with escalation to deal lead
**Day 7:** Escalate to Managing Partner / seller advisor
**Day 10:** Assess if blocking and adjust deal timeline or approach

---

## Phase 4: Data Analysis & Evidence Creation

### When Data Arrives

**Step 4.1: Initial Triage (Athena)**
- Log receipt date in MRL
- Assess format and completeness
- Assign to appropriate agent(s)
- Set analysis deadline
- Note if follow-up needed

**Step 4.2: Data Processing (Assigned Agent)**
- Convert files using excel2md or pdf2md
- Store originals in `/raw_data/[workstream]/`
- Store converted MD in `/analysis/[workstream]/`
- Update MRL with file locations

**Step 4.3: Analysis (Assigned Agent)**
- Analyze data per request objective
- Document key findings in MRL
- Identify red flags immediately
- Note gaps or inconsistencies
- Quantify where possible

**Step 4.4: Evidence Creation (Themis)**
- Create evidence IDs for verifiable claims
- Link evidence to source files
- Rate evidence strength
- Document in evidence tracker
- Cross-reference with MRL request ID

**Step 4.5: Integration (Prometheus & Others)**
- Use findings in business evaluation
- Reference evidence IDs in reports
- Link back to MRL request ID
- Note if findings change assessment

---

## Phase 5: Integration with Business Evaluation

### Linking MRL to Outputs

**For Prometheus (Business Evaluator):**
```
Value Creation Opportunity identified
         ↓
Check: Which MRL requests support this?
         ↓
Reference: REQ-XXX, REQ-XXX
         ↓
Include in report with evidence IDs
         ↓
Update MRL: "Used in evaluation section X"
```

**For Themis (Evidence Verifier):**
```
Claim in Prometheus's report
         ↓
Check: Which MRL requests provide evidence?
         ↓
Trace: REQ-XXX → File location → Specific data
         ↓
Create: Evidence ID (EV-XXX)
         ↓
Update MRL: Add evidence ID to request
```

**For Logos (Financial Modeler):**
```
Financial data needed for model
         ↓
Check: Which MRL requests contain this?
         ↓
Extract: From files linked in MRL
         ↓
Validate: Against multiple sources
         ↓
Update MRL: Note usage in financial model
```

---

## MRL Best Practices

### For Athena (MRL Owner)

**Do:**
- ✅ Update MRL in real-time, not batch at end of day
- ✅ Keep dashboard current for Managing Partner visibility
- ✅ Escalate blocks immediately, don't wait
- ✅ Celebrate wins and completed sections
- ✅ Maintain detailed notes on management interactions
- ✅ Link every piece of received data to its MRL request
- ✅ Track data quality systematically

**Don't:**
- ❌ Let status fall >1 day out of date
- ❌ Allow high-priority items to go >5 days without follow-up
- ❌ Accept poor quality data without pushback
- ❌ Lose track of which agent has which data
- ❌ Forget to document why items are blocked
- ❌ Skip the daily dashboard update

### For All Agents

**Do:**
- ✅ Check MRL daily for new assignments
- ✅ Update your status as you progress
- ✅ Document findings directly in MRL
- ✅ Flag issues immediately to Athena
- ✅ Reference MRL req IDs in all work product
- ✅ Coordinate with other agents on shared requests

**Don't:**
- ❌ Work on data without updating MRL status
- ❌ Hoard findings - share in real-time
- ❌ Skip documenting gaps or issues
- ❌ Analyze data without converting to MD first
- ❌ Create evidence without linking to MRL
- ❌ Forget to note quality concerns

---

## MRL Quality Metrics

### Target Metrics

| Metric | Target | Status |
|--------|--------|--------|
| High-priority completion rate | >90% | [Track] |
| Average response time from management | <5 days | [Track] |
| Data quality (avg) | >4/5 stars | [Track] |
| Blocked items | <10% | [Track] |
| Evidence chain completeness | 100% | [Track] |
| Daily dashboard updates | 100% | [Track] |

### Weekly Review Questions

1. Are we on track to complete diligence on schedule?
2. Are any critical items blocked? What's the unblock plan?
3. Is management responsive and cooperative?
4. Is data quality sufficient for confident decision-making?
5. Are all agents making adequate progress?
6. Have we identified any deal-breaking issues?
7. Are there areas where we need to deepen investigation?

---

## Escalation Framework

### When to Escalate to Managing Partner

**Immediate Escalation (Same Day):**
- Deal-breaking red flag discovered
- Management refuses to provide critical information
- Material misrepresentation identified
- Legal/regulatory violation uncovered

**Weekly Escalation (Status Update):**
- Overall progress summary
- Blocked items summary
- Key findings and risks
- Timeline assessment

**Ad-Hoc Escalation (As Needed):**
- Significant delays in receiving data
- Quality issues with management responses
- Need for additional resources or expertise
- Change in deal structure affecting requests

---

## MRL Templates & Tools

### Available Templates

1. **master-request-list-template.md**
   - Full detailed tracking
   - Use as primary MRL

2. **mrl-quick-dashboard.md**
   - Executive summary view
   - Daily updates
   - Use for team communication

3. **mrl-weekly-status.md** (to be created)
   - Weekly rollup for Managing Partner
   - Trends and progress assessment

### Conversion Tools

**For processing received data:**
```bash
# Excel files
./excel2md convert [file].xlsx -o analysis/[workstream]/[file].md

# PDF documents
./pdf2md convert [file].pdf -o analysis/[workstream]/[file].md
```

**File organization:**
```
/[deal-name]/
├── master-request-list-[deal-name].md
├── mrl-quick-dashboard-[deal-name].md
├── raw_data/
│   ├── financial/
│   ├── commercial/
│   ├── operational/
│   ├── compliance/
│   └── legal/
└── analysis/
    ├── financial/
    ├── commercial/
    ├── operational/
    ├── compliance/
    └── legal/
```

---

## Integration with Other Workflows

### MRL ↔ Business Evaluation Workflow

```
MRL Request REQ-XXX (e.g., "Revenue by client")
         ↓
Data received & processed
         ↓
Prometheus analyzes for business evaluation
         ↓
Finding: "Top 10 clients = 60% revenue (concentration risk)"
         ↓
Themis verifies: Creates EV-045 pointing to REQ-XXX data
         ↓
Prometheus includes in report: "Concentration risk [Ref: EV-045]"
         ↓
MRL updated: REQ-XXX → "Used in risk assessment; Evidence: EV-045"
```

### MRL ↔ Financial Modeling Workflow

```
MRL Requests REQ-010, REQ-015, REQ-022 (financial data)
         ↓
Data received & processed
         ↓
Logos extracts for model building
         ↓
Creates revenue model with assumptions
         ↓
Themis verifies assumptions against MRL data
         ↓
Logos includes source references in model
         ↓
MRL updated: Link to model file and assumptions
```

---

## Troubleshooting Common Issues

### Issue: Management Not Responding
**Solution:**
1. Check if request was clear and reasonable
2. Follow up with specific deadline
3. Offer to accept alternative format
4. Escalate through deal lead/advisor
5. If critical: Document as blocker and assess deal risk

### Issue: Poor Quality Data
**Solution:**
1. Document specific quality issues in MRL
2. Request clarification or re-submission
3. Attempt to work with data if possible
4. Note quality concern in evidence tracker
5. Adjust confidence levels in business evaluation

### Issue: Agent Overload
**Solution:**
1. Review workload distribution in MRL
2. Re-assign less critical items
3. Extend deadline if not on critical path
4. Batch similar analysis tasks
5. Focus on high-priority items first

### Issue: Data Contradictions
**Solution:**
1. Document both sources in MRL
2. Request clarification from management
3. Themis investigates and documents
4. Escalate if material to deal thesis
5. Include as risk flag if unresolved

---

## Success Indicators

### You're Doing It Right If:
- ✅ MRL is updated multiple times daily
- ✅ Dashboard accurately reflects current status
- ✅ Every received file is logged and assigned
- ✅ All analysis references MRL request IDs
- ✅ Evidence tracker links back to MRL
- ✅ Managing Partner has clear visibility
- ✅ No surprises in final business evaluation
- ✅ Complete evidence chain for all claims

### Warning Signs:
- ⚠️ MRL hasn't been updated in 24+ hours
- ⚠️ Multiple high-priority items blocked
- ⚠️ Agents working on data not in MRL
- ⚠️ Evidence created without MRL linkage
- ⚠️ Dashboard doesn't match detailed MRL
- ⚠️ Management unresponsive for >7 days
- ⚠️ Data quality consistently poor

---

**Workflow maintained by:** Athena (Due Diligence Orchestrator)
**Supporting:** All SmallPE agents in diligence process
**For:** Systematic, complete, evidence-based due diligence
**SmallPE AI-First Private Equity**
