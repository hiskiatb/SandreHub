export function generateOTP(length = 6) {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 10)
  ).join(""); // STRING BUKAN NUMBER
}