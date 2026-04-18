export async function runAgent(message: string) {
  return {
    answer: `You asked: "${message}"`,
    sources: [],
    artifact: null,
  };
}