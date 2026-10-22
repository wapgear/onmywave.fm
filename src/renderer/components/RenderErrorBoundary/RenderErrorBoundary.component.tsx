import { Component, createRef } from 'react';
import type { ReactNode } from 'react';

import './RenderErrorBoundary.styles.css';

type RenderErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
  scope: 'page' | 'root';
};

type RenderErrorBoundaryState = { failed: boolean; resetKey?: string };

export class RenderErrorBoundary extends Component<RenderErrorBoundaryProps, RenderErrorBoundaryState> {
  constructor(props: RenderErrorBoundaryProps) {
    super(props);
    this.state = { failed: false, resetKey: props.resetKey };
  }

  private boundaryContent = createRef<HTMLDivElement>();
  private fallbackHeading = createRef<HTMLHeadingElement>();
  private focusPageAfterRetry = false;

  static getDerivedStateFromError(): Partial<RenderErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: RenderErrorBoundaryProps,
    state: RenderErrorBoundaryState,
  ): Partial<RenderErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  componentDidMount() {
    this.focusFallbackIfNeeded();
  }

  componentDidUpdate(_previousProps: RenderErrorBoundaryProps, previousState: RenderErrorBoundaryState) {
    if (!previousState.failed && this.state.failed) this.focusFallbackIfNeeded();

    if (previousState.failed && !this.state.failed && this.focusPageAfterRetry) {
      this.focusPageAfterRetry = false;
      if (document.activeElement === document.body) {
        const target =
          this.boundaryContent.current?.querySelector<HTMLElement>('.back-button') ??
          this.boundaryContent.current?.querySelector<HTMLElement>('.page-heading h1') ??
          this.boundaryContent.current?.querySelector<HTMLElement>('h1');
        if (target) {
          if (!target.matches('button, a, input, select, textarea, [tabindex]')) target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }
      }
    }
  }

  private focusFallbackIfNeeded() {
    if (this.state.failed && document.activeElement === document.body)
      this.fallbackHeading.current?.focus({ preventScroll: true });
  }

  private retryPage = () => {
    this.focusPageAfterRetry = true;
    this.setState({ failed: false });
  };

  private reloadApp = () => window.location.reload();

  render() {
    if (!this.state.failed)
      return (
        <div ref={this.boundaryContent} className="render-boundary-content">
          {this.props.children}
        </div>
      );

    return this.props.scope === 'page' ? (
      <div ref={this.boundaryContent} className="render-boundary-content">
        <section className="render-error page-render-error" role="alert" aria-labelledby="page-render-error-title">
          <h1 ref={this.fallbackHeading} id="page-render-error-title" tabIndex={-1}>
            This page couldn't be displayed.
          </h1>
          <p>The player and navigation are still available. You can retry this page or choose another one.</p>
          <button onClick={this.retryPage}>Retry page</button>
        </section>
      </div>
    ) : (
      <div ref={this.boundaryContent} className="render-boundary-content">
        <main className="render-error root-render-error" role="alert" aria-labelledby="root-render-error-title">
          <h1 ref={this.fallbackHeading} id="root-render-error-title" tabIndex={-1}>
            onmywave.fm couldn't open this view.
          </h1>
          <p>Reloading tries to restore your saved queue with playback paused. Music may have stopped.</p>
          <button onClick={this.reloadApp}>Reload app</button>
        </main>
      </div>
    );
  }
}
