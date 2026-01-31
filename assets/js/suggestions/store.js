// ================================================================
// DAILY SUGGESTIONS - STORAGE & CACHING
// ================================================================
// Handles persistence of suggestions (Supabase preferred, localStorage fallback)
// ================================================================

export class DailySuggestionsStore {
  constructor() {
    this.useSupabase = true;
    this.tableName = 'daily_suggestions';
    this.checkSupabaseTable();
  }

  /**
   * Check if Supabase table exists, fallback to localStorage if not
   */
  async checkSupabaseTable() {
    try {
      const { error } = await window.supabase
        .from(this.tableName)
        .select('id')
        .limit(1);
      
      if (error && error.code === '42P01') {
        // Table doesn't exist
        console.warn('⚠️ daily_suggestions table not found, using localStorage fallback');
        this.useSupabase = false;
      }
    } catch (err) {
      console.warn('⚠️ Supabase check failed, using localStorage fallback');
      this.useSupabase = false;
    }
  }

  /**
   * Store suggestions for a date
   */
  async storeSuggestions(userId, date, suggestions) {
    if (this.useSupabase) {
      return this.storeInSupabase(userId, date, suggestions);
    } else {
      return this.storeInLocalStorage(userId, date, suggestions);
    }
  }

  /**
   * Get suggestions for a specific date
   */
  async getSuggestionsForDate(userId, date) {
    if (this.useSupabase) {
      return this.getFromSupabase(userId, date);
    } else {
      return this.getFromLocalStorage(userId, date);
    }
  }

  /**
   * Get recent suggestions (for cooldown)
   */
  async getRecentSuggestions(userId, days) {
    if (this.useSupabase) {
      return this.getRecentFromSupabase(userId, days);
    } else {
      return this.getRecentFromLocalStorage(userId, days);
    }
  }

  /**
   * Clean old suggestions (older than N days)
   */
  async cleanOldSuggestions(userId, daysToKeep = 30) {
    if (this.useSupabase) {
      return this.cleanSupabase(userId, daysToKeep);
    } else {
      return this.cleanLocalStorage(userId, daysToKeep);
    }
  }

  // ================================================================
  // SUPABASE METHODS
  // ================================================================

  async storeInSupabase(userId, date, suggestions) {
    try {
      // Delete existing suggestions for this date
      await window.supabase
        .from(this.tableName)
        .delete()
        .eq('user_id', userId)
        .eq('date', date);
      
      // Insert new suggestions
      const rows = suggestions.map(s => ({
        user_id: userId,
        date: date,
        suggestion_type: s.suggestion_type,
        target_id: s.target_id,
        score: s.score,
        why: s.why,
        data: s.data || {}
      }));
      
      const { error } = await window.supabase
        .from(this.tableName)
        .insert(rows);
      
      if (error) throw error;
      
      console.log(`✅ Stored ${suggestions.length} suggestions in Supabase`);
      return true;
    } catch (err) {
      console.error('❌ Failed to store in Supabase:', err);
      // Fallback to localStorage
      this.useSupabase = false;
      return this.storeInLocalStorage(userId, date, suggestions);
    }
  }

  async getFromSupabase(userId, date) {
    try {
      const { data, error } = await window.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .order('score', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('❌ Failed to get from Supabase:', err);
      this.useSupabase = false;
      return this.getFromLocalStorage(userId, date);
    }
  }

  async getRecentFromSupabase(userId, days) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      
      const { data, error } = await window.supabase
        .from(this.tableName)
        .select('suggestion_type, target_id')
        .eq('user_id', userId)
        .gte('date', cutoffStr);
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('❌ Failed to get recent from Supabase:', err);
      this.useSupabase = false;
      return this.getRecentFromLocalStorage(userId, days);
    }
  }

  async cleanSupabase(userId, daysToKeep) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      
      const { error } = await window.supabase
        .from(this.tableName)
        .delete()
        .eq('user_id', userId)
        .lt('date', cutoffStr);
      
      if (error) throw error;
      console.log(`✅ Cleaned old suggestions from Supabase`);
    } catch (err) {
      console.error('❌ Failed to clean Supabase:', err);
    }
  }

  // ================================================================
  // LOCALSTORAGE METHODS
  // ================================================================

  getStorageKey(userId, date) {
    return `daily_suggestions_${userId}_${date}`;
  }

  getAllStorageKeys(userId) {
    const prefix = `daily_suggestions_${userId}_`;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  storeInLocalStorage(userId, date, suggestions) {
    try {
      const key = this.getStorageKey(userId, date);
      localStorage.setItem(key, JSON.stringify(suggestions));
      console.log(`✅ Stored ${suggestions.length} suggestions in localStorage`);
      return true;
    } catch (err) {
      console.error('❌ Failed to store in localStorage:', err);
      return false;
    }
  }

  getFromLocalStorage(userId, date) {
    try {
      const key = this.getStorageKey(userId, date);
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('❌ Failed to get from localStorage:', err);
      return [];
    }
  }

  getRecentFromLocalStorage(userId, days) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const allKeys = this.getAllStorageKeys(userId);
      const recentSuggestions = [];
      
      allKeys.forEach(key => {
        // Extract date from key: daily_suggestions_userId_YYYY-MM-DD
        const dateStr = key.split('_').pop();
        const date = new Date(dateStr);
        
        if (date >= cutoffDate) {
          const data = localStorage.getItem(key);
          if (data) {
            const suggestions = JSON.parse(data);
            recentSuggestions.push(...suggestions);
          }
        }
      });
      
      return recentSuggestions;
    } catch (err) {
      console.error('❌ Failed to get recent from localStorage:', err);
      return [];
    }
  }

  cleanLocalStorage(userId, daysToKeep) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const allKeys = this.getAllStorageKeys(userId);
      let cleaned = 0;
      
      allKeys.forEach(key => {
        const dateStr = key.split('_').pop();
        const date = new Date(dateStr);
        
        if (date < cutoffDate) {
          localStorage.removeItem(key);
          cleaned++;
        }
      });
      
      console.log(`✅ Cleaned ${cleaned} old suggestions from localStorage`);
    } catch (err) {
      console.error('❌ Failed to clean localStorage:', err);
    }
  }
}
