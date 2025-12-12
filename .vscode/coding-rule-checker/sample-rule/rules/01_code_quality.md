## 1. Code Quality Rules

### 1.1 Naming Conventions

Variable and function names should be descriptive and follow camelCase convention.

- Use meaningful names that describe the purpose
- Avoid single-letter variables except for loop counters
- Use camelCase for variables and functions
- Use PascalCase for classes and types

**Good Example:**

```javascript
const userProfile = getUserProfile();
function calculateTotalPrice(items) { ... }
```

**Bad Example:**

```javascript
const x = getUP();
function calc(i) { ... }
```

### 1.2 Function Complexity

Functions should be small and focused on a single responsibility.

- Keep functions under 50 lines
- Each function should do one thing well
- Extract complex logic into separate functions
- Avoid deeply nested conditionals (max 3 levels)

### 1.3 Error Handling

Always handle errors appropriately.

- Use try-catch blocks for operations that might fail
- Provide meaningful error messages
- Don't silently catch and ignore errors
- Log errors for debugging

**Good Example:**

```javascript
try {
  const data = await fetchData();
  processData(data);
} catch (error) {
  console.error('Failed to fetch data:', error);
  throw new Error('Data processing failed');
}
```

**Bad Example:**

```javascript
try {
  const data = await fetchData();
  processData(data);
} catch (error) {
  // Do nothing
}
```
