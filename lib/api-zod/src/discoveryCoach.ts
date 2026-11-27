import { z } from 'zod';

export const DiscoveryCoachBody = z.object({
  mode: z.enum(['coach','practice']), agency: z.string().max(300), stakeholder: z.string().max(100),
  topic: z.string().max(200), objection: z.string().max(300),
  history: z.array(z.object({role: z.enum(['user','assistant']), content: z.string().min(1).max(3000)})).min(1).max(15),
});
