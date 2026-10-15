# DJ and news transitions

Research and implementation decision, October 15, 2026.

## What the evidence supports

Radio transitions need control over placement, music level, fades and the gap around speech. Simply adding silence everywhere does not establish a natural radio sound.

- Venkatesh et al., ICASSP 2021, [Artificially Synthesising Data for Audio Classification and Segmentation to Improve Speech and Music Detection in Radio Broadcast](https://arxiv.org/abs/2102.09959), models both a fade followed by a short silent gap and overlapping transitions. It also models several fade curves and music ducking. This is an audio segmentation study, not a listener preference study. It supports the available techniques, not an optimal pause duration.
- [Audacity's Auto Duck manual](https://manual.audacityteam.org/man/auto_duck.html) documents music attenuation, separate fade-down and fade-up timing, and a maximum-pause setting to avoid rapid volume changes within speech. Hold the bed down throughout the bulletin rather than raising it during each sentence gap.
- [Radio.co's voice-tracking guide](https://blog.radio.co/blog/voice-tracking-radio-shows-sound-live) describes recorded presenter links inserted between songs, with editable cue and fade points.
- [Radio.co's continuous-radio guide](https://radio.co/blog/create-live-24-7-radio-station/) describes news bulletins with introductory and closing station audio. A dedicated bulletin is a useful alternative to talking over a song; jingles can be a later addition if wanted.
- Practitioner context, rather than controlled evidence: [radio operators discussing transitions](https://www.reddit.com/r/radio/comments/1qrdtds/improve_seguestransitions_with_automation_software/) emphasize per-track cue markers and listening to the join. Fixed timings cannot reliably find a vocal-free outro.

## Chosen behavior

Settings > General > DJ transitions provides global playout preferences. These are separate from DJ identity and saved audio provenance. Changes affect the next scheduled break, including the demo and saved takes, without regenerating speech.

Preview transition auditions the current form values before saving. It uses a synthesized sample music loop and the bundled saved DJ recording, with highlighted stages for the fades, breathing room, speech and next song. It needs no library selection or provider request. This demonstrates timing and placement; the sample music does not represent a particular library track. Preview pauses main playback without resuming it automatically. Stop, editing a transition value, leaving the settings section or restarting main playback releases the preview audio.

| Style | Placement | Fade down | Before speech | After speech | Fade next song up |
| --- | --- | --- | --- | --- | --- |
| Natural, default | Over music | 1.5 s | 0.8 s | 0.5 s | 1.5 s |
| Tight | Over music | 0.5 s | 0.2 s | 0.2 s | 0.5 s |
| News bulletin | Between songs | 1.5 s | 0.8 s | 0.5 s | 1.5 s |

These values are starting points for listening comparisons, not scientifically established best values. Individual controls allow fades from 0 to 5 seconds and gaps from 0 to 3 seconds.

Over music reserves fade + lead-in + voice + post-speech time near the song ending. The DJ's music-bed level remains in effect, limited to 8% as before. Breathing room here means quiet music, not silence. The outgoing song finishes before the next song starts, and the voice is never truncated to fit. Requests that cannot fit in the second half of the song explain how to switch to a bulletin.

Between songs fades the final music ending, waits for the song to finish, leaves the chosen silent gap, plays the full voice without a music bed, holds after speech, then fades the next song in. The previous fixed 22-second voice limit does not apply.

Pause freezes active transition stages. Skip, seek, replacement, stop and connection changes cancel pending speech. A scheduled break retains its settings snapshot. A break remains an explicit manual action; these settings do not enable automatic news scheduling.

## Listening checks

Compare the same saved take using Natural, Tight and News bulletin with a vocal ending, an instrumental ending, and an abrupt ending. Assess whether the first words are clear, the gap feels intentional, the bed masks the voice, and the next song enters comfortably. Increase breathing room in small steps rather than treating several seconds of silence as a default. If vocals compete with speech, choose News bulletin. Reliable talkover cue selection needs per-track cue markers or audio analysis, neither is implemented here. Audio loudness normalization and speech generation prosody remain separate work.
