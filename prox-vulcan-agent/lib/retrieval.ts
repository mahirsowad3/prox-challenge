export async function retrieveManualContext(query: string) {
  return [
    {
      source: "owner-manual.pdf",
      page: 1,
      text: "Placeholder manual chunk for now.",
    },
  ];
}