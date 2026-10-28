import type { ComponentPropsWithRef, ReactNode } from 'react';

import { InfoHelp } from '../InfoHelp/InfoHelp.component';

import './SectionHeading.styles.css';

type SectionHeadingProps = Omit<ComponentPropsWithRef<'h2'>, 'title' | 'children' | 'className'> & {
  as?: 'h2' | 'h3';
  className?: string;
  title: string;
  helpLabel: string;
  children: ReactNode;
};

export function SectionHeading({
  as: Heading = 'h2',
  className = '',
  title,
  helpLabel,
  children,
  ...headingProps
}: SectionHeadingProps) {
  return (
    <div className={`section-title ${className}`.trim()}>
      <Heading {...headingProps} className="section-title-heading">
        {title}
      </Heading>
      <InfoHelp label={helpLabel}>{children}</InfoHelp>
    </div>
  );
}
