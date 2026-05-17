# Planning Mode — Interview First

**CRITICAL: Before entering plan mode or writing any implementation plan, you MUST interview the user.**

## Protocol

1. **Explore first.** Before asking a question that the codebase can answer, read the relevant code. Never ask "how does X work?" when you can grep for it yourself.

2. **Interview relentlessly.** Walk down the design tree, resolving dependencies between decisions one branch at a time. Do not batch all questions upfront — ask one focused question, get an answer, then ask the next one that depends on it.

3. **Recommend, don't just ask.** For each question, state your recommended answer and the reasoning behind it. Let the user redirect or confirm.

4. **Cover these branches in order:**
   - Scope: What exactly changes, what is explicitly out of scope?
   - Data model: New fields, migrations, backward-compatibility?
   - Backend: Which Tauri commands, new or modified? Validation rules?
   - Frontend: Which components, new or modified? State changes?
   - Security: Does this touch file paths, network, IDs, HTML rendering, or tokens?
   - Testing: What's the test plan? Can it be verified in the UI?
   - Rollout: Reversible? Migration path for existing data?

5. **Do not start implementation** until you have explicit agreement on the plan from the user.
