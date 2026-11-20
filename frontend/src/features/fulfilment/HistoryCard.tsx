'use client';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getErrorMessage } from '@/lib/api';

import { historyOf, timelineEntries } from './activity';
import { useActivity } from './queries';

interface HistoryCardProps {
  /** The order or request IDs whose events to show. */
  references: readonly string[];
  now: Date;
}

/** A record's full history from the activity feed, oldest first, for a detail page's side column. */
export function HistoryCard({ references, now }: HistoryCardProps) {
  const activity = useActivity();
  const history = activity.data ? historyOf(activity.data, references) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Full history, oldest first</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.isPending ? (
          <p className="text-muted-foreground text-sm" role="status">
            Loading activity…
          </p>
        ) : activity.isError ? (
          <p className="text-destructive text-sm" role="alert">
            Could not load the activity: {getErrorMessage(activity.error)}
          </p>
        ) : history.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
        ) : (
          <ActivityTimeline entries={timelineEntries(history, { now })} />
        )}
      </CardContent>
    </Card>
  );
}
