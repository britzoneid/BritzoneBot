import fs from 'fs/promises';
import path from 'path';

/**
 * Single operation step data
 */
export interface OperationStep {
  completed: boolean;
  timestamp: number;
  [key: string]: any;
}

/**
 * Operation progress tracking
 */
export interface OperationProgress {
  started: boolean;
  completed: boolean;
  steps: Record<string, OperationStep>;
  startTime: number;
  completedTime?: number;
}

/**
 * Current operation details
 */
export interface CurrentOperation {
  type: string;
  params: Record<string, any>;
  progress: OperationProgress;
}

/**
 * Guild state data
 */
interface GuildState {
  currentOperation?: CurrentOperation;
  history?: CurrentOperation[];
}

/**
 * Timer data for breakout sessions
 */
export interface TimerData {
  totalMinutes: number;
  startTime: number;
  guildId: string;
  breakoutRooms: string[];
  fiveMinSent: boolean;
  [key: string]: any;
}

/**
 * Manages state persistence for breakout room operations to enable recovery
 * from network interruptions or other failures.
 */
export class StateManager {
  private statePath: string;
  private stateFile: string;
  private inMemoryState: Record<string, GuildState | TimerData>;
  private initialized: boolean;
  private saveQueue: Promise<void>;

  constructor() {
    this.statePath = path.join(process.cwd(), 'data');
    this.stateFile = path.join(this.statePath, 'breakoutState.json');
    this.inMemoryState = {};
    this.initialized = false;
    this.saveQueue = Promise.resolve();
  }

  /**
   * Initialize the state manager, ensuring the data directory exists
   * and loading any existing state
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.statePath, { recursive: true });
      await this.loadState();
      this.initialized = true;
      console.log('📂 StateManager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize StateManager:', error);
    }
  }

  /**
   * Load state from disk
   */
  async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.stateFile, 'utf8');
      this.inMemoryState = JSON.parse(data);
      console.log('📤 Loaded breakout state data');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Error loading breakout state:', error);
      }
      this.inMemoryState = {};
      console.log('🆕 Created new breakout state data');
    }
  }

  /**
   * Save state to disk with concurrency safety
   */
  async saveState(): Promise<void> {
    // Queue the save operation to prevent race conditions with file writes
    const nextSave = this.saveQueue.then(async () => {
      try {
        await this.initialize();
        await fs.writeFile(this.stateFile, JSON.stringify(this.inMemoryState, null, 2));
        console.log('💾 Saved breakout state data');
      } catch (error) {
        console.error('❌ Error saving breakout state:', error);
      }
    });

    // Update the queue reference, catching errors to ensure the queue allows future writes
    this.saveQueue = nextSave.catch(() => {});

    return nextSave;
  }

  /**
   * Start tracking a new operation
   */
  async startOperation(guildId: string, operationType: string, params: Record<string, any>): Promise<void> {
    await this.initialize();
    if (!this.inMemoryState[guildId]) {
      this.inMemoryState[guildId] = {} as GuildState;
    }

    const guildState = this.inMemoryState[guildId] as GuildState;
    guildState.currentOperation = {
      type: operationType,
      params,
      progress: {
        started: true,
        completed: false,
        steps: {},
        startTime: Date.now(),
      },
    };

    console.log(`📝 Started tracking ${operationType} operation for guild ${guildId}`);
    await this.saveState();
  }

  /**
   * Update progress for an operation
   */
  async updateProgress(guildId: string, step: string, data: Record<string, any> = {}): Promise<boolean> {
    await this.initialize();
    const guildState = this.inMemoryState[guildId] as GuildState | undefined;
    
    if (!guildState?.currentOperation) {
      console.log(`⚠️ No operation in progress for guild ${guildId}`);
      return false;
    }

    guildState.currentOperation.progress.steps[step] = {
      completed: true,
      timestamp: Date.now(),
      ...data,
    };

    console.log(`✅ Updated progress for guild ${guildId}: ${step}`);
    await this.saveState();
    return true;
  }

  /**
   * Complete an operation
   */
  async completeOperation(guildId: string): Promise<void> {
    await this.initialize();
    const guildState = this.inMemoryState[guildId] as GuildState | undefined;
    
    if (!guildState?.currentOperation) return;

    guildState.currentOperation.progress.completed = true;
    guildState.currentOperation.progress.completedTime = Date.now();

    // Move current operation to history
    if (!guildState.history) {
      guildState.history = [];
    }

    guildState.history.push(guildState.currentOperation);

    // Clear current operation
    delete guildState.currentOperation;

    console.log(`🏁 Completed operation for guild ${guildId}`);
    await this.saveState();
  }

  /**
   * Check if there's an operation in progress
   */
  async hasOperationInProgress(guildId: string): Promise<boolean> {
    await this.initialize();
    const guildState = this.inMemoryState[guildId] as GuildState | undefined;
    
    return (
      !!guildState?.currentOperation && !guildState.currentOperation.progress.completed
    );
  }

  /**
   * Get the current operation details
   */
  async getCurrentOperation(guildId: string): Promise<CurrentOperation | undefined> {
    await this.initialize();
    const guildState = this.inMemoryState[guildId] as GuildState | undefined;
    return guildState?.currentOperation;
  }

  /**
   * Clear the current operation without marking as completed
   * Used when resuming an operation to prevent infinite recursion
   */
  async clearCurrentOperation(guildId: string): Promise<void> {
    await this.initialize();
    const guildState = this.inMemoryState[guildId] as GuildState | undefined;

    if (guildState?.currentOperation) {
      delete guildState.currentOperation;
      await this.saveState();
    }
  }

  /**
   * Get completed steps for the current operation
   */
  async getCompletedSteps(guildId: string): Promise<Record<string, OperationStep>> {
    await this.initialize();
    const guildState = this.inMemoryState[guildId] as GuildState | undefined;
    
    if (!guildState?.currentOperation) return {};
    return guildState.currentOperation.progress.steps;
  }

  /**
   * Clear state for a guild
   */
  async clearGuildState(guildId: string): Promise<void> {
    await this.initialize();
    delete this.inMemoryState[guildId];
    await this.saveState();
    console.log(`🧹 Cleared state data for guild ${guildId}`);
  }

  /**
   * Sets timer data for a guild
   * @param guildId The guild ID
   * @param timerData Timer data object
   */
  async setTimerData(guildId: string, timerData: TimerData): Promise<void> {
    console.log(`💾 Storing timer data for guild ${guildId}`);
    this.inMemoryState[`timer_${guildId}`] = timerData;
    await this.saveState();
  }

  /**
   * Gets timer data for a guild
   * @param guildId The guild ID
   * @returns Timer data object or null if not found
   */
  async getTimerData(guildId: string): Promise<TimerData | null> {
    await this.initialize();
    const timerKey = `timer_${guildId}`;
    return (this.inMemoryState[timerKey] as TimerData) || null;
  }

  /**
   * Clears timer data for a guild
   * @param guildId The guild ID
   */
  async clearTimerData(guildId: string): Promise<void> {
    console.log(`🗑️ Clearing timer data for guild ${guildId}`);
    delete this.inMemoryState[`timer_${guildId}`];
    await this.saveState();
  }
}

// Export a singleton instance
export default new StateManager();
