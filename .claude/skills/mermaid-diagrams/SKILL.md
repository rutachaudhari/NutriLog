---
name: mermaid-diagrams
description: >
  Add or improve Mermaid diagrams in markdown documents. Use this skill whenever the user:
  - mentions "Mermaid", "mermaid diagram", or asks to "embed a diagram"
  - asks to visualize, diagram, or chart something in a .md file
  - is editing a README, docs page, or any markdown document and wants a visual
  - describes a flow, sequence, process, schema, or relationship that would benefit from a diagram
  - asks for a flowchart, sequence diagram, ER diagram, Gantt chart, class diagram, state diagram, or pie chart in markdown
  Trigger even if the user doesn't say "Mermaid" — if they're in a markdown context and want something visualized, this skill applies.
---

# Mermaid Diagrams in Markdown

You help users add clear, accurate Mermaid diagrams to their markdown documents.

## How Mermaid works in markdown

Mermaid diagrams are written inside a fenced code block with the `mermaid` language tag:

````markdown
```mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -- Yes --> C[Do thing]
    B -- No --> D[Skip]
```
````

Most markdown renderers that support Mermaid (GitHub, GitLab, Notion, Obsidian, VS Code preview, many doc platforms) will render this as a live diagram. Always use this format.

## Choosing the right diagram type

Pick the type that best fits what the user is trying to show. Don't default to flowchart when another type is a better fit.

| Diagram type | Best for |
|---|---|
| `flowchart` | Step-by-step processes, decision trees, branching logic |
| `sequenceDiagram` | API calls, request/response cycles, interactions between actors over time |
| `erDiagram` | Database tables, entity relationships, data models |
| `classDiagram` | OOP class hierarchies, interface relationships |
| `stateDiagram-v2` | State machines, lifecycle transitions |
| `gantt` | Project timelines, task scheduling |
| `pie` | Proportional breakdown (keep it simple — only use for 3-7 slices) |
| `graph` | Same as flowchart, use `flowchart` for clarity |
| `journey` | User journey / experience maps |
| `C4Context` | Software architecture (C4 model) |

If the user says "flowchart" but what they described is clearly sequential between actors, use `sequenceDiagram` and briefly explain why — the goal is the most useful diagram, not literally interpreting the word they used.

## Writing good diagrams

**Be faithful to the content.** Your diagram should accurately represent what the user described — don't invent nodes or relationships they didn't mention.

**Labels should be meaningful but concise.** Long labels break layouts. Aim for 2-5 words per node; if you need more, use a short ID and a `%%` comment or a legend.

**Direction matters for flowcharts.** Use `TD` (top-down) for hierarchies and processes, `LR` (left-right) for pipelines and data flows. State it explicitly so the diagram renders predictably.

**Sequence diagrams: name your actors well.** Use the role, not a generic letter. `User`, `AuthService`, `Database` reads better than `A`, `B`, `C`.

**Validate syntax mentally before writing.** Common mistakes:
- Spaces in bare node IDs → wrap in quotes or use underscores: `A["node label"]` or `node_id`
- Arrow direction mixups: `-->` (solid), `-.->` (dashed), `==>` (thick)
- Forgetting `%%` for comments — raw `//` breaks the parser
- ER diagrams need relationship lines like `||--o{` — don't invent syntax

## Workflow

1. **Understand the context.** Read the surrounding document or ask one targeted question if the user's description is ambiguous. Don't ask multiple questions at once.

2. **Pick the diagram type.** Use the table above. If multiple types fit, pick the one that reveals the most structure.

3. **Draft the diagram.** Write the Mermaid block. Keep it accurate; aim for clarity over completeness — a clean 8-node diagram is more useful than a cluttered 30-node one.

4. **Place it in the document.** Insert the diagram at the point in the document where it's most helpful — right after the paragraph it illustrates, or at the start of a section it summarizes. Don't just append to the end.

5. **Add a caption if helpful.** For complex diagrams, a short italicized line below (`*Figure: ...*`) helps readers orient themselves.

6. **Offer to iterate.** After showing the diagram, say what you simplified or left out, and invite the user to ask for adjustments. Don't over-explain — one sentence is enough.

## Mermaid syntax quick reference

**Flowchart node shapes:**
```
A[Rectangle]
B(Rounded)
C{Diamond / decision}
D[(Database cylinder)]
E[[Subprocess]]
F((Circle))
G>Asymmetric]
```

**Flowchart arrows:**
```
A --> B          solid arrow
A --- B          solid line, no arrow
A -.-> B         dashed arrow
A ==> B          thick arrow
A -->|label| B   arrow with label
```

**Sequence diagram basics:**
```
sequenceDiagram
    participant U as User
    participant S as Server
    U->>S: GET /api/data
    S-->>U: 200 OK { data }
    Note over S: processes request
```

**ER diagram basics:**
```
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ITEM : contains
    USER {
        int id PK
        string email
        string name
    }
```

**State diagram basics:**
```
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : start
    Processing --> Done : success
    Processing --> Error : fail
    Done --> [*]
    Error --> Idle : retry
```

## What to avoid

- Don't produce a Mermaid block and immediately say "let me know if this renders correctly" — it sounds uncertain. Write with confidence; offer to adjust.
- Don't pad diagrams with nodes the user didn't describe — accuracy matters more than impressiveness.
- Don't forget to actually edit or create the file. If the user is working in a `.md` file, make the change; don't just show the diagram in chat.
