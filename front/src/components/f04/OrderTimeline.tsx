'use client';

import { Icon } from '../ui/Icon';
import styles from './f04.module.css';

/**
 * Order progress timeline (boards: order detail "Order progress").
 * Steps are supplied by the caller so every status can render its own
 * sequence; demo-only, no backend state implied.
 */

interface TimelineStep {
  label: string;
  tag?: string;
  date: string;
  note?: string;
  done: boolean;
  active: boolean;
}

interface OrderTimelineProps {
  steps: TimelineStep[];
}

export function OrderTimeline({ steps }: OrderTimelineProps) {
  return (
    <div className={styles.timeline}>
      {steps.map((step, index) => (
        <div key={index} className={styles.timelineStep}>
          <div
            className={`stepDot ${step.done ? 'stepDot done' : step.active ? 'stepDot active' : ''}`}
          />
          {step.done ? (
            <Icon name="done" size={14} strokeWidth={2.6} stroke="#ffffff" aria-hidden="true" />
          ) : null}
          <span className={`stepLabel ${step.done ? 'stepLabel done' : ''}`}>{step.label}</span>
          {step.tag ? <span className={styles.stepDate}>{step.tag}</span> : null}
          <span className={styles.stepDate}>{step.date}</span>
          {step.note ? <span className={styles.stepDate}>{step.note}</span> : null}
        </div>
      ))}
    </div>
  );
}
