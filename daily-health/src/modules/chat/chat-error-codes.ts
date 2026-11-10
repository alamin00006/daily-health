/** Error codes of the chat module. The apps map each to Bangla text; never rename. */
export const ChatErrorCode = {
  /** Not a participant, or no such conversation (indistinguishable on purpose). */
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  /** The consultation ended: the chat is read only. */
  CONVERSATION_CLOSED: 'CONVERSATION_CLOSED',
} as const;
