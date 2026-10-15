const React = require('react');

// Mock implementation to test useEffect closure behavior
// We can't easily test this without a full DOM environment, but standard React rules apply:
// useEffect created in render N has access to state in render N.
// If setSearchMode("db") is called, render N+1 occurs.
// In render N+1, activeKeyword is whatever it was set to.
// The useEffect for render N+1 will run because searchMode changed (it's in the deps array).
// It will see activeKeyword as "trump".
