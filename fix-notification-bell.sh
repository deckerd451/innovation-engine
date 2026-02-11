#!/bin/bash
# Fix notification bell to show message count

sed -i.bak13 '60s/.*/      \/\/ Get unread message count from messaging RPC/' assets/js/notification-bell.js
sed -i.bak14 '60a\
      const { data: messageCount, error: countError } = await window.supabase.rpc("get_unread_count");\
      if (!countError && messageCount !== null && messageCount !== undefined) {\
        unreadCount = messageCount;\
      } else {\
        unreadCount = 0;\
      }\
\
      \/\/ Still load notifications for panel\
      const { data, error } = await window.supabase\
        .from("notifications")\
        .select("*")\
        .eq("user_id", currentUserProfile.id)\
        .order("created_at", { ascending: false })\
        .limit(50);\
\
      if (!error) {\
        notifications = data || [];\
      }
' assets/js/notification-bell.js

# Remove the old lines
sed -i.bak15 '47,60d' assets/js/notification-bell.js

echo "✅ Fixed notification-bell.js"
