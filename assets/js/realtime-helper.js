/**
 * Realtime Helper
 * Centralized utility for handling Supabase Realtime subscriptions with graceful fallback
 */

/**
 * Subscribe to a Supabase channel with improved error handling
 * @param {Object} supabase - Supabase client
 * @param {string} channelName - Name of the channel
 * @param {Object} config - Channel configuration
 * @param {Function} config.onData - Callback for data changes
 * @param {string} config.event - Event type ('INSERT', 'UPDATE', 'DELETE', '*')
 * @param {string} config.table - Table name
 * @param {string} config.schema - Schema name (default: 'public')
 * @param {string} config.filter - Optional filter
 * @param {Function} config.onSuccess - Optional callback when subscription succeeds
 * @param {Function} config.onError - Optional callback when subscription fails
 * @returns {Object} Channel subscription
 */
export function subscribeToChannel(supabase, channelName, config) {
  const {
    onData,
    event = '*',
    table,
    schema = 'public',
    filter,
    onSuccess,
    onError
  } = config;

  const changeConfig = {
    event,
    schema,
    table
  };

  if (filter) {
    changeConfig.filter = filter;
  }

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', changeConfig, onData)
    .subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Real-time updates active: ${channelName}`);
        if (onSuccess) onSuccess();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.log(`ℹ️ Real-time unavailable for ${channelName}, using manual refresh`);
        if (error) {
          console.debug(`Real-time error details for ${channelName}:`, error);
        }
        if (onError) onError(error);
      }
    });

  return channel;
}

/**
 * Subscribe to presence channel with improved error handling
 * @param {Object} supabase - Supabase client
 * @param {string} channelName - Name of the channel
 * @param {Object} config - Presence configuration
 * @param {Function} config.onSync - Callback for presence sync
 * @param {Function} config.onJoin - Callback for presence join
 * @param {Function} config.onLeave - Callback for presence leave
 * @param {Function} config.onSuccess - Optional callback when subscription succeeds
 * @param {Function} config.onError - Optional callback when subscription fails
 * @returns {Object} Channel subscription
 */
export function subscribeToPresence(supabase, channelName, config) {
  const {
    onSync,
    onJoin,
    onLeave,
    onSuccess,
    onError
  } = config;

  let channel = supabase.channel(channelName);

  if (onSync) {
    channel = channel.on('presence', { event: 'sync' }, onSync);
  }
  if (onJoin) {
    channel = channel.on('presence', { event: 'join' }, onJoin);
  }
  if (onLeave) {
    channel = channel.on('presence', { event: 'leave' }, onLeave);
  }

  channel = channel.subscribe((status, error) => {
    if (status === 'SUBSCRIBED') {
      console.log(`✅ Presence updates active: ${channelName}`);
      if (onSuccess) onSuccess();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.log(`ℹ️ Presence unavailable for ${channelName}`);
      if (error) {
        console.debug(`Presence error details for ${channelName}:`, error);
      }
      if (onError) onError(error);
    }
  });

  return channel;
}

/**
 * Subscribe to broadcast channel with improved error handling
 * @param {Object} supabase - Supabase client
 * @param {string} channelName - Name of the channel
 * @param {Object} config - Broadcast configuration
 * @param {string} config.event - Event name
 * @param {Function} config.onMessage - Callback for broadcast messages
 * @param {Function} config.onSuccess - Optional callback when subscription succeeds
 * @param {Function} config.onError - Optional callback when subscription fails
 * @returns {Object} Channel subscription
 */
export function subscribeToBroadcast(supabase, channelName, config) {
  const {
    event,
    onMessage,
    onSuccess,
    onError
  } = config;

  const channel = supabase
    .channel(channelName)
    .on('broadcast', { event }, onMessage)
    .subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Broadcast channel active: ${channelName}`);
        if (onSuccess) onSuccess();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.log(`ℹ️ Broadcast unavailable for ${channelName}`);
        if (error) {
          console.debug(`Broadcast error details for ${channelName}:`, error);
        }
        if (onError) onError(error);
      }
    });

  return channel;
}

/**
 * Unsubscribe from a channel safely
 * @param {Object} channel - Channel to unsubscribe from
 */
export async function unsubscribeChannel(channel) {
  if (!channel) return;
  
  try {
    await channel.unsubscribe();
    console.log('✅ Channel unsubscribed');
  } catch (error) {
    console.debug('Error unsubscribing from channel:', error);
  }
}
