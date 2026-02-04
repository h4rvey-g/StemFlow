import React from 'react'
import { render, screen } from '@testing-library/react'

describe('setup test', () => {
  it('works', () => {
    render(<div>setup</div>)
    expect(screen.getByText('setup')).toBeInTheDocument()
  })
})
