# Lyrics motion and edge fades

Native smooth scrolling follows timed lines. Active text eases its color and shifts four pixels; a gradient mask fades the reading area over 32 pixels at the top and 48 pixels at the bottom. Header and player controls stay outside the mask. Padding keeps the Follow button and last line readable. Reduced motion disables smooth scrolling and line transitions.

Before images were captured before editing. Matched fictional song and paused state at 1280×800 and 960×640; all images were visually inspected, including the scrolled 960-wide view. Production renderer/preload ran in a disposable Electron fixture with synthetic timed lyrics and silent local audio. Network calls were blocked.

Verified intermediate scroll positions during a seek to 90 seconds, following still enabled after settling, immediate wheel interruption, Follow resumption, scrollbar pointer interruption, and emulated reduced motion with instant scrolling and no active-line transform. A song-change check exposed queued scroll events from the previous song; the fix resets the new reading area and ignores scroll events that did not change its position. Build, type, lint and format checks passed. Live Jellyfin and VoiceOver were not exercised.
