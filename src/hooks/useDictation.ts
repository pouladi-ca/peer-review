/**
 * Dictation via the browser's SpeechRecognition (webkit-prefixed on Safari), with
 * interim results and the restart budget Safari needs: its recogniser ends the session
 * on a short silence even with `continuous = true`, so listening restarts itself until
 * the reviewer stops it, and a recogniser that keeps dying is given up on rather than
 * spun. Only final text reaches the caller, appended, so a restart never loses words.
 * Speech never leaves the device except through the browser's own recogniser.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechEvent {
  resultIndex: number;
  results: { readonly length: number; [index: number]: SpeechResult };
}
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognizerCtor = new () => Recognizer;

function ctor(): RecognizerCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const RESTART_LIMIT = 3;
const RESTART_WINDOW_MS = 2000;

export interface Dictation {
  available: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  toggle(): void;
  stop(): void;
}

export function useDictation(onFinal: (text: string) => void): Dictation {
  const available = ctor() !== null;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognizer | null>(null);
  const wanted = useRef(false);
  const burst = useRef<{ since: number; count: number }>({ since: 0, count: 0 });
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const teardown = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    if (r) {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try {
        r.abort();
      } catch {
        /* already stopped */
      }
    }
    setListening(false);
    setInterim('');
  }, []);

  const begin = useCallback(() => {
    const C = ctor();
    if (!C) return;
    const r = new C();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || 'en-US';
    r.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const t = res[0]?.transcript ?? '';
        if (res.isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText.trim()) onFinalRef.current(finalText.trim());
      setInterim(interimText);
    };
    r.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone access was denied.');
        wanted.current = false;
        teardown();
      } else if (event.error === 'no-speech' || event.error === 'aborted') {
        /* Safari's idle timeout; onend restarts */
      } else setError('Dictation stopped unexpectedly.');
    };
    r.onend = () => {
      rec.current = null;
      setInterim('');
      if (!wanted.current) {
        setListening(false);
        return;
      }
      const now = Date.now();
      if (now - burst.current.since > RESTART_WINDOW_MS) burst.current = { since: now, count: 0 };
      burst.current.count += 1;
      if (burst.current.count > RESTART_LIMIT) {
        wanted.current = false;
        setListening(false);
        setError('Dictation is not working in this browser right now.');
        return;
      }
      try {
        begin();
      } catch {
        wanted.current = false;
        setListening(false);
      }
    };
    rec.current = r;
    r.start();
    setListening(true);
  }, [teardown]);

  const stop = useCallback(() => {
    wanted.current = false;
    teardown();
  }, [teardown]);

  const toggle = useCallback(() => {
    if (wanted.current) {
      stop();
      return;
    }
    setError(null);
    wanted.current = true;
    burst.current = { since: Date.now(), count: 0 };
    try {
      begin();
    } catch {
      wanted.current = false;
      setError('Dictation could not start.');
    }
  }, [begin, stop]);

  useEffect(() => () => teardown(), [teardown]);

  return { available, listening, interim, error, toggle, stop };
}
