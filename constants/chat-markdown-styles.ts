/** react-native-markdown-display style object */
export const chatMarkdownStyles = {
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#000",
    marginTop: 0,
    marginBottom: 0,
  },
  strong: {
    fontWeight: "700" as const,
  },
  bullet_list: {
    marginTop: 0,
    marginBottom: 0,
  },
  list_item: {
    marginTop: 0,
    marginBottom: 2,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: "#D7D7D7",
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  thead: {
    backgroundColor: "#ECECEC",
  },
  th: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#111",
  },
  td: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    color: "#111",
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
};
