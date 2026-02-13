import * as React from 'react';
import * as ReactDOM from 'react-dom';
import axe from '@axe-core/react';

// Only run in development
if (typeof window !== 'undefined') {
  axe(React, ReactDOM, 1000);
}
