# Grammatical Commit Reviews & Analysis

## Commit 1: build macOS-inspired Grammatical terminal workspace

### Scope
Establish the core terminal workspace UI with draggable window, minimizable/maximizable states, Dock navigation, and dark theme.

### Code Files Analyzed

#### Core App Setup
- **client/src/App.tsx**: ErrorBoundary, ThemeProvider (dark mode), Router with NotFound fallback
- **client/src/pages/Home.tsx**: Main terminal interface (2629+ lines)
- **client/src/const.ts**: OAuth configuration, login flow

#### UI Components
- **client/src/components/DashboardLayout.tsx**: Layout with sidebar, user auth, responsive design
- **client/src/components/ErrorBoundary.tsx**: Error handling
- **client/src/components/ui/**: Radix UI components (menubar, dropdown, avatar, sidebar, etc.)

#### Styling
- **client/src/index.css**: CSS variables, dark theme palette, typography
- CSS classes: `.terminal-*`, `.dock*`, `.traffic-lights`, `.brand-*`

#### Server Setup
- **server/_core/index.ts**: Express server entry point, trpc router mounting
- **server/_core/trpc.ts**: tRPC router configuration, publicProcedure, router factory
- **server/routers.ts**: Main appRouter with system, auth, transform, history, metrics routers

#### Database & Auth
- **drizzle/schema.ts**: Users table with OAuth (openId), role-based access, timestamps
- **server/_core/cookies.ts**: Session cookie management (COOKIE_NAME, options)

### Key Features Implemented

**1. Terminal Window (macOS-style)**
```typescript
// Home.tsx: Terminal state management
const [terminal, setTerminal] = useState({ 
  open: true, 
  minimized: false, 
  maximized: false, 
  x: 96, 
  y: 70 
});
```

**2. Draggable Window**
```typescript
// Pointer-based drag handling with bounds checking
const handleTitlePointerMove = (event: PointerEvent) => {
  if (!drag || terminal.maximized) return;
  setTerminal(current => ({ 
    ...current, 
    x: Math.max(12, Math.min(window.innerWidth - 280, ...)),
    y: Math.max(34, Math.min(window.innerHeight - 140, ...))
  }));
};
```

**3. Dock with Four Transformation Modes**
```jsx
<nav className="dock" aria-label="Transformation modes">
  <button className="terminal-dock-control">...</button>
  <span className="dock-separator" />
  {["proofread", "improve", "natural", "rewrite"].map(modeButton)}
</nav>
```

**4. Mode Metadata**
```typescript
const MODE_META: Record<TransformationMode, { 
  label: string; 
  description: string; 
  accent: string; 
  icon: IconType 
}> = {
  proofread: { label: "Proofread", accent: "mint", icon: CheckCheck },
  improve: { label: "Improve", accent: "blue", icon: Sparkles },
  natural: { label: "Natural", accent: "coral", icon: MoreHorizontal },
  rewrite: { label: "Rewrite", accent: "violet", icon: RotateCcw },
};
```

**5. Welcome Transcript**
```typescript
const WELCOME: TranscriptEntry[] = [
  { kind: "system", text: "Grammatical semantic workspace ready. The model proposes; Grammatical decides." },
  { kind: "system", text: "Choose a Dock mode, paste text, and press Enter. Type help for local commands." },
  { kind: "system", text: "Tip: long pastes are grouped at paragraph, line, and sentence boundaries before transformation." },
];
```

**6. Dark Theme Setup**
```jsx
<ThemeProvider defaultTheme="dark">
  <TooltipProvider>
    <Toaster />
    <Router />
  </TooltipProvider>
</ThemeProvider>
```

**7. Auth Integration**
```typescript
const { loading, user } = useAuth();
// Sign-in flow in DashboardLayout
if (!user) {
  return <div className="flex items-center justify-center min-h-screen">
    <Button onClick={() => startLogin()}>Sign in</Button>
  </div>;
}
```

**8. Keyboard Shortcuts**
```typescript
if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
  handleSubmit();
}
// Help text: ⌘/Ctrl+Enter submit · ⌘/Ctrl+Shift+C copy · etc.
```

**9. Local Storage Persistence**
```typescript
// Mode intensities
useEffect(() => {
  const saved = window.localStorage.getItem("grammatical.mode-intensities");
  if (saved) setModeIntensities(prev => ({ ...prev, ...JSON.parse(saved) }));
}, []);

// Document review settings
useEffect(() => {
  const saved = window.localStorage.getItem("grammatical.document-review-settings");
  if (saved) {
    const { title, profileId, protectedTerms, codeCommentOnly } = JSON.parse(saved);
    setDocumentTitle(title);
    setWritingProfile(profileId);
    setProtectedTerms(protectedTerms);
    setCodeCommentOnly(codeCommentOnly);
  }
}, []);
```

### Architecture Decisions

**Window State Management**: Separate x/y coordinates + modal flags rather than single "state" string
- Enables precise positioning restoration
- Supports maximized mode bypass
- Bounds checking prevents off-screen positioning

**Transcript Entry Types**: Discriminated union with kind field
- `system`: Welcome & status messages
- `input`: User command echoes
- `processing`: Loading spinner state
- `paste-block`: Multi-block uploads
- `output`: Transform results
- `error`: Error messages with optional retry action
- `help`: Command documentation

**Mode Intensities**: Stored per-mode, not global
```typescript
Record<TransformationMode, TransformationIntensity>
// { proofread: "low", improve: "standard", natural: "standard", rewrite: "high" }
```

**OAuth State Binding**: CSRF protection via `__Host-` cookie prefix
- Nonce generated client-side
- State parameter carries both redirectUri and nonce
- Server verifies nonce matches cookie at callback

### Testing Considerations

- [ ] Dragging within bounds (viewport edges)
- [ ] Minimized/maximized state persistence
- [ ] Mode switch updates Dock active indicator
- [ ] Keyboard shortcuts: ⌘Enter, ⌘Shift+C, ⌘Alt+I, ⌘Alt+B, Escape
- [ ] localStorage survives page reload
- [ ] Theme applies correctly to all components
- [ ] OAuth callback CSRF validation
- [ ] Welcome transcript renders correctly on first load

### Files Modified

**New/Significant**:
- `client/src/pages/Home.tsx` (2629+ lines)
- `client/src/App.tsx`
- `client/src/const.ts`
- `server/_core/index.ts`
- `server/_core/trpc.ts`
- `server/routers.ts`
- `drizzle/schema.ts` (users table)

**Supporting**:
- `client/src/components/DashboardLayout.tsx`
- `client/src/components/ErrorBoundary.tsx`
- `client/src/index.css` (dark theme CSS)
- `package.json` (dependencies: react, trpc, radix-ui, express, drizzle-orm)

### Commit Message

```
feat: build macOS-inspired Grammatical terminal workspace

- add draggable terminal window with minimizable/maximizable states
- add bottom Dock with Proofread, Improve, Natural, and Rewrite mode buttons
- add dark theme with macOS-like styling and traffic light controls
- add menubar with File (New session, Open Terminal) and Help menus
- add local storage persistence for mode intensities and document settings
- add keyboard shortcuts (⌘Enter submit, ⌘Shift+C copy, ⌘Alt+I intensity, Escape cancel)
- add welcome transcript with tagline: "The model proposes; Grammatical decides."
- add OAuth login integration with CSRF-protected state binding
- add ErrorBoundary and ThemeProvider for React app resilience
- setup tRPC routers for transform, history, metrics, system, and auth
- setup Drizzle ORM schema with users table and OAuth openId field
```

---

## Commit 2: add desktop shell, draggable terminal, and mode Dock

### Status: Code Review Pending
*See Commit 1 analysis above—this commit is closely related and builds on the same code.*

---

## Commit 3: add Proofread Improve Natural and Rewrite modes

### Scope
Implement the four transformation modes with mode-specific metadata and intensity presets.

### Code Analysis In Progress...

---

## Commit 4: add local commands, transcript state, and keyboard workflows

### Status: Code Review Pending

---

## Commit 5: add typed SSE streaming with semantic validation

### Status: Code Review Pending

---

## Commit 6: preserve source and recover cleanly from provider failures

### Status: Code Review Pending

---

## Commit 7: add abortable deadlines bounded retries and circuit protection

### Status: Code Review Pending

---

## Commit 8: add authenticated quotas concurrency leases and spend guards

### Status: Code Review Pending

---

## Commit 9: prevent unsafe candidates from reaching accepted output

### Status: Code Review Pending

---

## Commit 10: add boundary-aware chunking for large documents

### Status: Code Review Pending

---

## Commit 11: add sequential block processing and deterministic text downloads

### Status: Code Review Pending

---

## Commit 12: preserve grapheme clusters emoji and meaningful whitespace

### Status: Code Review Pending

---

## Commit 13: add per-block outputs and combined Download all workflow

### Status: Code Review Pending

---

## Commit 14: add rich output formatting and clipboard workflows

### Status: Code Review Pending

---

## Commit 15: add searchable transformation sessions and deletion controls

### Status: Code Review Pending

---

## Commit 16: add Markdown HTML DOCX and plain-text output formats

### Status: Code Review Pending

---

## Commit 17: add tracked changes with selective accept and reject decisions

### Status: Code Review Pending

---

## Commit 18: add typed passage context and entity-role inference

### Status: Code Review Pending

---

## Commit 19: preserve Markdown GitHub PR content and fenced code

### Status: Code Review Pending

---

## Commit 20: add opt-in code-comment-only transformation mode

### Status: Code Review Pending

---

## Commit 21: add protected-term import export and auto-detection

### Status: Code Review Pending

---

## Commit 22: add finalization gating and provenance-rich change reports

### Status: Code Review Pending

---

## Commit 23: add synchronized raw source and rendered preview

### Status: Code Review Pending

---

## Commit 24: add durable privacy-safe fleet transformation telemetry

### Status: Code Review Pending

---

## Commit 25: add SLO error-budget policy and incident runbook

### Status: Code Review Pending

---

## Commit 26: add production AI regression and failure-injection suites

### Status: Code Review Pending

---

## Commit 27: add benchmark load soak and release-gate specifications

### Status: Code Review Pending

---

## Commit 28: add complete Grammatical product and architecture documentation

### Status: Code Review Pending

---
