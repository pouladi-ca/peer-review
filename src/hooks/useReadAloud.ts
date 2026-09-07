import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Block, ReflowDoc } from '../lib/reflow/types';

export type ReadAloudState = 'idle' | 'speaking' | 'paused';

const RATES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export type Rate = (typeof RATES)[number];
export const READ_RATES = RATES;

/** True when this browser can speak text. */
export function readAloudSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

const speakable = (b: Block) => (b.type === 'heading' || b.type === 'paragraph' || b.type === 'list-item') && !!b.text.trim();

/** Long paragraphs are spoken in sentence-sized pieces: some engines cut an utterance off after a few hundred characters. */
function pieces(text: string): string[] {
  const parts = text.split(/(?<=[.!?;:])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length > 260) {
      out.push(cur);
      cur = p;
    } else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Read the reflowed document aloud with the browser's speech engine, block by block,
 * highlighting the current block and keeping it in view. Starts from a block id or from
 * the block nearest the top of the viewport.
 */
export function useReadAloud(doc: ReflowDoc | undefined, scrollRef: RefObject<HTMLDivElement | null>, contentRef: RefObject<HTMLDivElement | null>) {
  const [state, setState] = useState<ReadAloudState>('idle');
  const [rate, setRateState] = useState<Rate>(() => {
    try {
      const v = Number(localStorage.getItem('panelist.readRate'));
      return (RATES as readonly number[]).includes(v) ? (v as Rate) : 1;
    } catch {
      return 1;
    }
  });
  const [current, setCurrent] = useState<string | null>(null);
  const queue = useRef<Block[]>([]);
  const index = useRef(0);
  const rateRef = useRef<Rate>(rate);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);
  const stopped = useRef(true);

  const mark = useCallback(
    (id: string | null) => {
      const root = contentRef.current;
      if (!root) return;
      root.querySelectorAll('.is-speaking').forEach((el) => el.classList.remove('is-speaking'));
      if (!id) return;
      const el = root.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`);
      if (!el || !scrollRef.current) return;
      el.classList.add('is-speaking');
      const box = el.getBoundingClientRect();
      const host = scrollRef.current.getBoundingClientRect();
      if (box.top < host.top + 40 || box.bottom > host.bottom - 80) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [contentRef, scrollRef],
  );

  const stop = useCallback(() => {
    stopped.current = true;
    if (readAloudSupported()) window.speechSynthesis.cancel();
    queue.current = [];
    setState('idle');
    setCurrent(null);
    mark(null);
  }, [mark]);

  const speakFrom = useCallback(
    (i: number) => {
      const synth = window.speechSynthesis;
      const block = queue.current[i];
      if (!block) return stop();
      index.current = i;
      setCurrent(block.id);
      mark(block.id);
      const parts = pieces(block.text);
      let k = 0;
      const next = () => {
        if (stopped.current) return;
        if (k >= parts.length) return speakFrom(i + 1);
        const u = new SpeechSynthesisUtterance(parts[k]);
        k += 1;
        u.rate = rateRef.current;
        u.onend = next;
        u.onerror = (e) => {
          if (e.error === 'interrupted' || e.error === 'canceled') return;
          next();
        };
        synth.speak(u);
      };
      // A heading gets a beat before and after so the structure is audible.
      if (block.type === 'heading') setTimeout(next, 250);
      else next();
    },
    [mark, stop],
  );

  const blockAtTop = useCallback((): string | undefined => {
    const root = contentRef.current;
    const host = scrollRef.current;
    if (!root || !host) return undefined;
    const top = host.getBoundingClientRect().top + 80;
    for (const el of root.querySelectorAll<HTMLElement>('[data-block]')) {
      if (el.getBoundingClientRect().bottom > top) return el.dataset.block;
    }
    return undefined;
  }, [contentRef, scrollRef]);

  const start = useCallback(
    (fromBlockId?: string) => {
      if (!doc || !readAloudSupported()) return;
      window.speechSynthesis.cancel();
      const blocks = doc.blocks.filter(speakable);
      const from = fromBlockId ?? blockAtTop();
      let i = from ? blocks.findIndex((b) => b.id === from) : 0;
      if (i < 0) i = 0;
      queue.current = blocks;
      stopped.current = false;
      setState('speaking');
      speakFrom(i);
    },
    [doc, blockAtTop, speakFrom],
  );

  const pause = useCallback(() => {
    if (state !== 'speaking') return;
    window.speechSynthesis.pause();
    setState('paused');
  }, [state]);

  const resume = useCallback(() => {
    if (state !== 'paused') return;
    window.speechSynthesis.resume();
    setState('speaking');
  }, [state]);

  const skip = useCallback(
    (delta: number) => {
      if (state === 'idle') return;
      const i = Math.max(0, Math.min(queue.current.length - 1, index.current + delta));
      window.speechSynthesis.cancel();
      stopped.current = false;
      setState('speaking');
      // cancel() fires onerror/onend on the current utterance asynchronously; start the next after that settles.
      setTimeout(() => speakFrom(i), 60);
    },
    [state, speakFrom],
  );

  const setRate = useCallback(
    (r: Rate) => {
      setRateState(r);
      try {
        localStorage.setItem('panelist.readRate', String(r));
      } catch {
        /* ignore */
      }
      // Apply to the next piece; the current one keeps its rate.
    },
    [],
  );

  // Stop when the document changes or the view unmounts.
  useEffect(() => () => stop(), [doc, stop]);

  return { state, current, rate, setRate, start, pause, resume, stop, skip, supported: readAloudSupported() };
}
