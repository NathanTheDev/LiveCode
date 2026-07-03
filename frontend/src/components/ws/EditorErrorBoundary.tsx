import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Editor crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-zinc-300">
          <p className="text-sm font-medium text-red-300">The editor ran into a problem and stopped.</p>
          <p className="max-w-md text-xs text-zinc-500">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 font-medium"
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
