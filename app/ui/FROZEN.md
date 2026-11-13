# Frozen shell files (beads-lite-1bo5.6.59.2)

Later tasks do NOT edit these. A change = a comment "SHELL-REQ" on
beads-lite-1bo5.6.59; the cto batches them.

- app/index.html (all u3-\*.css links are pre-listed), the one hook in
  app/main.js
- app/ui/boot.js, shell.js, routes.js, i18n.js, flag.js, icons.js
- app/ui/components/\* (button, chip, card, list-row, role-chip, sheet, tab-bar)
- app/css/u3-tokens.css, u3-base.css, u3-shell.css
- app/fonts/\*, scripts/legacy-untouched.mjs, scripts/payload-v3.mjs

Stubs each later task owns (view, css, i18n):
app/ui/views/{desk,task,tasks,releases,projects,settings,time}.js,
app/css/u3-{card,desk,task,tasks,releases,projects,settings,ask,time,mention}.css,
app/ui/i18n/{desk,card,task,tasks,releases,ask,time}.js.

Seams (owner fills the body, signature stays): card/steps.js renderStepsComment
(task 4), task/composer-ext.js registerComposerExtension (13), task/time-slot.js
renderTimeSlot (12), tasks/lanes.js groupIssues (10), tasks/bulk.js
renderBulkBar (11), ask/head-slot.js renderAskHead (8). views/kit.js is the
primitives test page (#/ui-kit).
