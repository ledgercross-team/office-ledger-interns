'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ScrollyStep {
  kicker: string;
  title: string;
  body: ReactNode;
}

// Scrollytelling: a sticky panel on one side and a column of steps on the other. The step
// that crosses the middle of the viewport becomes `active`, and the panel redraws for it.
export function Scrolly({
  steps,
  panel,
}: {
  steps: ScrollyStep[];
  panel: (active: number) => ReactNode;
}) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const reduce = useReducedMotion();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.step));
          }
        }
      },
      // A thin band across the middle of the viewport.
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const element of refs.current) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [steps.length]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
      <div className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-[0_1px_2px_rgba(28,43,37,0.06)] lg:sticky lg:top-6 lg:z-10 lg:self-start">
        {panel(active)}
      </div>

      <ol className="space-y-4 lg:space-y-0">
        {steps.map((step, index) => (
          <li
            key={step.title}
            ref={(element) => {
              refs.current[index] = element;
            }}
            data-step={index}
            className="flex lg:min-h-[60vh] lg:items-center"
          >
            <motion.div
              animate={{ opacity: reduce || active === index ? 1 : 0.4, x: active === index ? 0 : 6 }}
              transition={{ duration: reduce ? 0 : 0.3 }}
              className="rounded-2xl border border-charcoal/10 bg-white p-5"
            >
              <p className="text-xs font-semibold tracking-widest text-evergreen uppercase">
                {step.kicker}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-charcoal">{step.title}</h3>
              <div className="mt-2 text-sm text-charcoal-soft">{step.body}</div>
            </motion.div>
          </li>
        ))}
      </ol>
    </div>
  );
}
