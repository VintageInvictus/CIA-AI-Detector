# CIA AI Detector

A screening tool for recruitment applications. Paste an applicant's Google Form answers and some of their Discord messages, and it marks the patterns AI writing tends to leave, compares the form with how the applicant normally writes, and suggests follow-up questions.

Everything runs in the visitor's browser. Nothing that is pasted is uploaded or stored on a server. Each division's name and terms are saved only in that person's own browser.

The result is a screening indicator, not proof. Deny based on the follow-up, never on the score alone.

## How it works

Nine signals. No single one means much; the result rises only when several agree. The index counts patterns and is not a probability.

| Signal | Weight | What it looks for |
|--------|--------|-------------------|
| Different from their Discord | High | Vocabulary level, AI-typical words, dashes, lowercase "i", skipped apostrophes and slang compared with their messages |
| AI-typical vocabulary | High | Words chatbots overuse (furthermore, foster, paramount, thrive) per 100 words |
| Pasted formatting | High | Literal `**bold**` or `#` markers, which Google Forms doesn't render |
| Stock application phrases | Medium | "valuable asset", "commitment to excellence", "this experience taught me" |
| Even sentence rhythm | Medium | Sentences that are all about the same length |
| Little concrete detail | Medium | Few names, numbers, dates or division terms |
| Em dashes | Low | Counts for more when they never use dashes in Discord |
| Lists of three | Low | Repeated "X, Y, and Z" lists of qualities |
| No casual traces | Low | Flawless capitalization and punctuation |

## Using it fairly

- **Low:** process normally. **Read closely:** compare with their Discord yourself. **Verify in person:** run the follow-up before deciding.
- Deny on the follow-up, never on the score. Formal writers, non-native English speakers and Grammarly users can trip some signals.
- Follow-up: open a ticket, ask two or three of the generated questions, then give one new question to answer within 5 minutes and run that reply through as their Discord sample.
- Make the form harder to fake: ask about trainings or raids only members would know, add a notice that AI-written answers are denied and answers may be checked in voice, and include a scenario that needs your SOP.

## Files

| File | What it is |
|------|------------|
| `index.html` | The page |
| `styles.css` | The look (colors, fonts, layout, light and dark mode) |
| `app.js` | The analysis and everything interactive |
| `favicon.svg` | The browser-tab icon |

The `.claude` folder is only for previewing on this computer. Don't upload it.

## Publish it on GitHub Pages (free)

1. Sign in at [github.com](https://github.com), or create a free account.
2. Click **+** (top right), then **New repository**.
   - Name: `cia-ai-detector` (this becomes part of the link).
   - Choose **Public**. Free GitHub Pages needs a public repository. Only the tool's code is public; nothing anyone pastes into the tool is ever stored there.
   - Click **Create repository**.
3. On the new, empty repository page, click **uploading an existing file**.
4. Drag in `index.html`, `styles.css`, `app.js`, `favicon.svg` and `README.md`. Click **Commit changes**.
5. Go to **Settings**, then **Pages** (left sidebar).
   - Under **Build and deployment**, set **Source** to **Deploy from a branch**.
   - Set **Branch** to **main** and the folder to **/ (root)**. Click **Save**.
6. Wait a minute or two and refresh the Pages settings. The link appears at the top:
   `https://YOUR-USERNAME.github.io/cia-ai-detector/`

Share that link with the other Headquarters members.

## Update it later

When `styles.css` or `app.js` changes, raise the `?v=` number on their links in `index.html` (for example `app.js?v=3` to `app.js?v=4`). Otherwise browsers can keep using the old copy for a while and the update seems not to work.

Open the repository on GitHub, click **Add file**, then **Upload files**, drag in the changed files and click **Commit changes**. The live site updates within a minute or two. Ask people to refresh if they still see the old version.

## Preview on this computer

From this folder, run:

```
python -m http.server 8765
```

Then open http://localhost:8765 in a browser.
