/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // testRegex rather than testMatch: glob patterns skip dot-directories in the checkout path.
  testRegex: "/src/.*\\.test\\.tsx?$",
};
