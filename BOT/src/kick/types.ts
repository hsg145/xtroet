import { z } from 'zod';

/** zod schemas for the chat.message.sent v1 webhook payload (see KickDevDocs). */
export const kickBadgeSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    count: z.number().optional(),
  })
  .passthrough();

export const kickIdentitySchema = z
  .object({
    username_color: z.string().optional(),
    badges: z.array(kickBadgeSchema).optional(),
  })
  .passthrough()
  .nullable()
  .optional();

export const kickUserSchema = z
  .object({
    is_anonymous: z.boolean().optional(),
    user_id: z.number().int(),
    username: z.string(),
    is_verified: z.boolean().optional(),
    profile_picture: z.string().optional().nullable(),
    channel_slug: z.string().optional().nullable(),
    identity: kickIdentitySchema,
  })
  .passthrough();

export const chatMessageSentSchema = z
  .object({
    message_id: z.string(),
    content: z.string(),
    created_at: z.string().optional(),
    emotes: z.array(z.unknown()).optional(),
    broadcaster: kickUserSchema,
    sender: kickUserSchema,
    replies_to: z
      .object({
        message_id: z.string(),
        content: z.string().optional(),
        sender: kickUserSchema.optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type ChatMessageSent = z.infer<typeof chatMessageSentSchema>;
export type KickUser = z.infer<typeof kickUserSchema>;
export type KickBadge = z.infer<typeof kickBadgeSchema>;

export const EVENT_CHAT_MESSAGE_SENT = 'chat.message.sent';
export const EVENT_CHAT_MESSAGE_SENT_VERSION = 1;

export interface NormalizedMessage {
  messageId: string;
  userId: number;
  username: string;
  content: string;
  broadcasterUserId: number;
  broadcasterSlug: string | null;
  createdAt: Date;
  badges: KickBadge[];
  isModerator: boolean;
  isSubscriber: boolean;
  isBroadcaster: boolean;
  isAnonymous: boolean;
}

export function normalizeChatMessage(payload: ChatMessageSent): NormalizedMessage {
  const badges = payload.sender.identity?.badges ?? [];
  const types = new Set(badges.map((b) => b.type.toLowerCase()));
  return {
    messageId: payload.message_id,
    userId: payload.sender.user_id,
    username: payload.sender.username,
    content: payload.content,
    broadcasterUserId: payload.broadcaster.user_id,
    broadcasterSlug: payload.broadcaster.channel_slug ?? null,
    createdAt: payload.created_at ? new Date(payload.created_at) : new Date(),
    badges,
    isModerator: types.has('moderator') || types.has('channel_moderator'),
    isSubscriber: types.has('subscriber'),
    isBroadcaster: types.has('broadcaster') || types.has('channel_owner'),
    isAnonymous: payload.sender.is_anonymous === true,
  };
}

/** Kick API error envelope: { data, message } */
export const kickErrorSchema = z
  .object({ message: z.string().optional(), data: z.unknown().optional() })
  .passthrough();

export const kickChannelsSchema = z.object({
  data: z
    .array(
      z.object({
        broadcaster_user_id: z.number().int(),
        slug: z.string(),
        livestream: z.unknown().optional(),
        stream: z.unknown().optional(),
        category: z.unknown().optional(),
      }),
    )
    .optional(),
  message: z.string().optional(),
});

export const kickSubscriptionsSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        event: z.string(),
        version: z.number().int().optional(),
        broadcaster_user_id: z.number().int().optional(),
        method: z.string().optional(),
        app_id: z.string().optional(),
      }),
    )
    .optional(),
  message: z.string().optional(),
});