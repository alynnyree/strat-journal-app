# Chrome Web Store listing — copy and paste

Everything Google's form asks for, written out. Nothing here needs changing
unless you want to.

---

## Item name
```
Strat Journal Auto-Capture
```

## Summary  (the short line — Google's limit is 132 characters; this is 119)
```
Captures your TradingView chart when your trade opens, at 15 minutes, and when it closes, and files it in your journal.
```

## Description
```
Strat Journal Auto-Capture is a personal tool for one trader keeping a record of
their own trades.

While it is running, it watches for your own trade activity and takes a picture of
your TradingView chart at three moments: when a trade opens, when it passes fifteen
minutes, and when it closes. Press "Start recording my charts" and it will also
record your chart and cut out each trade's own stretch of it.

Everything it captures goes straight to a server you run yourself, at an address you
type into its settings, where it is attached to the right trade in your own trading
journal. Nothing is sent anywhere else.

It can only see TradingView. It holds no permission for any other website and checks
the page before capturing anything.

WHAT YOU NEED
- Your own server running the Strat Journal backend, and the key it expects.
- Both are entered once in this extension's Settings.

WHAT IT DOES NOT DO
- No analytics, no advertising, no tracking.
- Nothing is sold, shared, or sent to the developer.
- It reads nothing from any site other than TradingView.

The source code is public: github.com/alynnyree/strat-journal-app, under
browser-extension/
```

## Category
```
Workflow & Planning
```

## Language
```
English (United States)
```

## Visibility
```
Unlisted
```
Not searchable, not browsable. Installs only from the link you are given.

---

# Privacy tab

## Single purpose
```
Captures images and screen recordings of the installer's own TradingView chart at
the moments their own trade opens, reaches fifteen minutes, and closes, and sends
them to a server the installer runs so they can be attached to that trade in the
installer's own trading journal.
```

## Permission justifications

### storage
```
Stores the two settings the installer types in: the address of their own server and
the key used to authenticate to it. Nothing else is stored.
```

### alarms
```
Checks once a minute whether the installer's own trade has opened, reached fifteen
minutes, or closed, so a picture can be taken at that moment. Chrome's alarms are
the only way for a background extension to run on a schedule.
```

### tabs
```
Identifies which tab is currently on screen, so the extension can check whether it
is the installer's TradingView chart before capturing anything. It does not read
page contents.
```

### activeTab
```
Grants access to the tab the installer is looking at at the moment they press
"Start recording my charts". Recording cannot be started without a deliberate
press, and this is the permission that press grants.
```

### tabCapture
```
Records the TradingView tab while the installer has explicitly switched recording
on, so that each of their trades can be reviewed afterwards as a moving chart
rather than three still pictures.
```

### offscreen
```
Chrome does not allow a background extension to hold a recording itself. An
offscreen document is the documented way to run a MediaRecorder, and is used for
nothing else.
```

### notifications
```
Reminds the installer to switch recording on at the start of a trading day, and again if one of their own trades opens while recording is off. Without it a trade goes unrecorded silently. No notification contains any user data — only a prompt to press the extension's own button.
```

### Host permission — https://*.tradingview.com/*
```
The chart being captured is on TradingView. This is the only site the extension
captures from, and the only site it holds permission for. A capture is refused,
with a message, if any other page is on screen.
```

## Data usage — tick these
- [x] **Website content** — images of the TradingView page.
- [ ] Personally identifiable information — NO
- [ ] Health information — NO
- [ ] Financial and payment information — NO
- [ ] Authentication information — NO
- [ ] Personal communications — NO
- [ ] Location — NO
- [ ] Web history — NO
- [ ] User activity — NO

## The three certifications — tick all three
- [x] I do not sell or transfer user data to third parties, outside of approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy policy URL
```
https://alynnyree.github.io/strat-journal-app/privacy.html
```

---

# Assets

- **Package to upload:** `strat-journal-auto-capture-1.2.zip`
- **Screenshot (1280x800):** `store-screenshot.png`
- **Icon (128x128):** already inside the package
