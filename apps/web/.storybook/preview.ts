import type { Preview } from '@storybook/react-vite'
import React from 'react'
// Import global styles
import '../src/styles.css'

// Create a simple wrapper component
const StoryWrapper = ({ children }: { children: React.ReactNode }) => (
  React.createElement('div', {
    style: {
      minHeight: '100vh',
      background: '#05080f',
      padding: '20px',
      color: '#f5f4f0'
    }
  }, children)
)

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    },

    // Add viewport settings to make the canvas area match the dark theme
    backgrounds: {
      default: 'dark',
      values: [
        {
          name: 'dark',
          value: '#05080f',
        },
      ],
    },
  },

  // Add global decorator to ensure consistent styling
  decorators: [
    (Story) => React.createElement(StoryWrapper, {}, React.createElement(Story)),
  ],
};

export default preview;