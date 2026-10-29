import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon,
  Folder,
  Shield,
  Settings,
  Plus,
  Lock,
  Unlock,
  Smartphone,
  Maximize2,
  CheckSquare,
  Square,
  ShieldAlert,
} from 'lucide-react';
import {
  MediaItem,
  Album,
  SecuritySettings,
  GalleryTab,
  MediaFilter,
} from './types/gallery';
import {
  getAllMedia,
  getAllAlbums,
  getSecuritySettings,
  saveSecuritySettings,
  seedInitialDataIfEmpty,
  updateMediaItem,
  deleteMediaItems,
  deleteAlbum,
} from './services/storage';
import { triggerHaptic } from './services/security';
import { AndroidStatusBar } from './components/AndroidStatusBar';
import { GalleryGrid } from './components/GalleryGrid';
import { AlbumsView } from './components/AlbumsView';
import { PinScreen } from './components/PinScreen';
import { MediaViewer } from './components/MediaViewer';
import { MediaImporter } from './components/MediaImporter';
import { AlbumModal } from './components/AlbumModal';
import { SettingsView } from './components/SettingsView';

export default function App() {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState<GalleryTab>('photos');
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPhoneFrame, setIsPhoneFrame] = useState<boolean>(true);

  // Data State
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [settings, setSettings] = useState<SecuritySettings>({
    pinHash: null,
    hasPin: false,
    securityQuestion: "What is your favorite travel destination?",
    securityAnswerHash: null,
    autoLockMinutes: 0,
    scrambleKeypad: false,
    failedAttempts: 0,
    lockedUntil: null,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Security / Vault Lock state
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);
  const [showPinModal, setShowPinModal] = useState<{
    open: boolean;
    mode: 'unlock' | 'setup' | 'change';
    onSuccessCallback?: () => void;
  }>({
    open: false,
    mode: 'unlock',
  });

  // Multi-selection state
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Viewer & Modals
  const [viewerState, setViewerState] = useState<{
    open: boolean;
    index: number;
    items: MediaItem[];
  }>({
    open: false,
    index: 0,
    items: [],
  });

  const [showImportModal, setShowImportModal] = useState<{
    open: boolean;
    albumId?: string | null;
    isPrivate?: boolean;
  }>({
    open: false,
  });

  const [showAlbumModal, setShowAlbumModal] = useState<{
    open: boolean;
    albumToEdit?: Album | null;
  }>({
    open: false,
  });

  // Target album picker for batch move
  const [showBatchMoveModal, setShowBatchMoveModal] = useState<{
    open: boolean;
    targetIds: string[];
  }>({
    open: false,
    targetIds: [],
  });

  // Auto-lock timer ref
  const lastActiveTimeRef = useRef<number>(Date.now());

  // Reload all data from storage
  const loadData = useCallback(async () => {
    try {
      const [allMedia, allAlbums, currentSettings] = await Promise.all([
        getAllMedia(),
        getAllAlbums(),
        getSecuritySettings(),
      ]);
      setMedia(allMedia);
      setAlbums(allAlbums);
      setSettings(currentSettings);
    } catch (err) {
      console.error('Failed to load local data', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load & seed
  useEffect(() => {
    (async () => {
      await seedInitialDataIfEmpty();
      await loadData();
    })();
  }, [loadData]);

  // Auto-lock handling on tab blur or visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (settings.autoLockMinutes === 0) {
          setIsVaultUnlocked(false);
        } else if (settings.autoLockMinutes > 0) {
          lastActiveTimeRef.current = Date.now();
        }
      } else {
        if (settings.autoLockMinutes > 0) {
          const elapsed = (Date.now() - lastActiveTimeRef.current) / (1000 * 60);
          if (elapsed >= settings.autoLockMinutes) {
            setIsVaultUnlocked(false);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [settings.autoLockMinutes]);

  // Tab switching with Vault lock check
  const handleTabSwitch = (tab: GalleryTab) => {
    triggerHaptic('light');
    setIsSelectionMode(false);
    setSelectedIds(new Set());

    if (tab === 'vault' && !isVaultUnlocked) {
      // If user hasn't set up PIN yet, open setup mode
      if (!settings.hasPin) {
        setShowPinModal({
          open: true,
          mode: 'setup',
          onSuccessCallback: () => {
            setIsVaultUnlocked(true);
            setActiveTab('vault');
          },
        });
      } else {
        setShowPinModal({
          open: true,
          mode: 'unlock',
          onSuccessCallback: () => {
            setIsVaultUnlocked(true);
            setActiveTab('vault');
          },
        });
      }
      return;
    }

    setActiveTab(tab);
  };

  // Lock Vault
  const handleLockVault = () => {
    setIsVaultUnlocked(false);
    if (activeTab === 'vault') {
      setActiveTab('photos');
    }
  };

  // Media Operations
  const handleToggleFavorite = async (item: MediaItem) => {
    const updatedFav = !item.isFavorite;
    await updateMediaItem(item.id, { isFavorite: updatedFav });
    setMedia((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, isFavorite: updatedFav } : m))
    );
  };

  const handleTogglePrivate = async (item: MediaItem) => {
    const updatedPrivate = !item.isPrivate;
    await updateMediaItem(item.id, { isPrivate: updatedPrivate });
    setMedia((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, isPrivate: updatedPrivate } : m))
    );
  };

  const handleMoveToAlbum = async (item: MediaItem, albumId: string | null) => {
    await updateMediaItem(item.id, { albumId });
    setMedia((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, albumId } : m))
    );
  };

  const handleDeleteItem = async (item: MediaItem) => {
    await deleteMediaItems([item.id]);
    setMedia((prev) => prev.filter((m) => m.id !== item.id));
    if (viewerState.open) {
      setViewerState({ open: false, index: 0, items: [] });
    }
  };

  // Batch actions
  const handleBatchDelete = async (ids: string[]) => {
    await deleteMediaItems(ids);
    setMedia((prev) => prev.filter((m) => !ids.includes(m.id)));
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBatchTogglePrivate = async (ids: string[], makePrivate: boolean) => {
    await Promise.all(ids.map((id) => updateMediaItem(id, { isPrivate: makePrivate })));
    setMedia((prev) =>
      prev.map((m) => (ids.includes(m.id) ? { ...m, isPrivate: makePrivate } : m))
    );
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBatchToggleFavorite = async (ids: string[]) => {
    await Promise.all(
      ids.map((id) => {
        const item = media.find((m) => m.id === id);
        return updateMediaItem(id, { isFavorite: !item?.isFavorite });
      })
    );
    setMedia((prev) =>
      prev.map((m) => (ids.includes(m.id) ? { ...m, isFavorite: !m.isFavorite } : m))
    );
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBatchMoveComplete = async (albumId: string | null) => {
    const ids = showBatchMoveModal.targetIds;
    await Promise.all(ids.map((id) => updateMediaItem(id, { albumId })));
    setMedia((prev) =>
      prev.map((m) => (ids.includes(m.id) ? { ...m, albumId } : m))
    );
    setShowBatchMoveModal({ open: false, targetIds: [] });
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  // Album Deletion
  const handleDeleteAlbum = async (albumId: string) => {
    await deleteAlbum(albumId);
    setAlbums((prev) => prev.filter((a) => a.id !== albumId));
    setMedia((prev) =>
      prev.map((m) => (m.albumId === albumId ? { ...m, albumId: null } : m))
    );
  };

  // Factory Reset
  const handleResetAllData = async () => {
    // Delete database and reload page
    const req = indexedDB.deleteDatabase('MyPrivateGalleryDB');
    req.onsuccess = () => {
      window.location.reload();
    };
    req.onerror = () => {
      window.location.reload();
    };
  };

  // Active media subsets
  const publicMedia = media.filter((m) => !m.isPrivate);
  const privateVaultMedia = media.filter((m) => m.isPrivate);

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-0 sm:p-4 select-none font-sans">
      {/* Container: Responsive Phone frame vs Full Width mode */}
      <div
        className={`w-full transition-all duration-300 flex flex-col bg-neutral-950 ${
          isPhoneFrame
            ? 'max-w-[430px] h-[100dvh] sm:h-[890px] sm:max-h-[92vh] sm:rounded-[44px] sm:border-[8px] sm:border-neutral-800/90 sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden relative'
            : 'max-w-6xl min-h-screen sm:min-h-[90vh] sm:my-4 sm:rounded-3xl sm:border sm:border-neutral-800 shadow-2xl relative'
        }`}
      >
        {/* Android Status Bar */}
        <AndroidStatusBar isVaultUnlocked={isVaultUnlocked} />

        {/* Top App Bar Contract */}
        <header className="w-full flex items-center justify-between px-4 py-2.5 border-b border-neutral-800/80 shrink-0 z-10 bg-neutral-950/80 backdrop-blur-md">
          {/* Brand zone */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-neutral-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <Shield className="w-4 h-4 fill-neutral-950" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-neutral-100 leading-none">
                My Private Gallery
              </h1>
              <span className="text-[10px] text-emerald-400 font-medium">
                Offline · Local Storage
              </span>
            </div>
          </div>

          {/* Right action controls */}
          <div className="flex items-center gap-1.5">
            {/* Quick Lock if vault is open */}
            {isVaultUnlocked && (
              <button
                onClick={() => {
                  triggerHaptic('success');
                  handleLockVault();
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Lock Private Vault"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden xs:inline">Lock Vault</span>
              </button>
            )}

            {/* Selection mode toggle */}
            {(activeTab === 'photos' || activeTab === 'vault') && (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setIsSelectionMode(!isSelectionMode);
                  if (isSelectionMode) setSelectedIds(new Set());
                }}
                className={`p-2 rounded-xl transition-colors text-xs font-medium flex items-center gap-1 ${
                  isSelectionMode
                    ? 'bg-amber-500 text-neutral-950 font-bold'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
                title="Select multiple"
              >
                {isSelectionMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </button>
            )}

            {/* Frame View Toggle (Phone Frame vs Full Width) */}
            <button
              onClick={() => {
                triggerHaptic('light');
                setIsPhoneFrame(!isPhoneFrame);
              }}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors hidden sm:flex"
              title={isPhoneFrame ? 'Expand to Full Width' : 'Switch to Android Phone View'}
            >
              {isPhoneFrame ? <Maximize2 className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Main Tab Content */}
        <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeTab === 'photos' ? (
            <GalleryGrid
              items={publicMedia}
              filter={filter}
              onFilterChange={setFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              isSelectionMode={isSelectionMode}
              selectedIds={selectedIds}
              onToggleSelect={(id) => {
                const next = new Set(selectedIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelectedIds(next);
              }}
              onSelectAll={() => setSelectedIds(new Set(publicMedia.map((m) => m.id)))}
              onClearSelection={() => setSelectedIds(new Set())}
              onItemClick={(item, index) => {
                setViewerState({
                  open: true,
                  index,
                  items: publicMedia,
                });
              }}
              onOpenImport={() => setShowImportModal({ open: true, isPrivate: false })}
              onBatchDelete={() => handleBatchDelete(Array.from(selectedIds))}
              onBatchMoveAlbum={() =>
                setShowBatchMoveModal({ open: true, targetIds: Array.from(selectedIds) })
              }
              onBatchTogglePrivate={(isPriv) =>
                handleBatchTogglePrivate(Array.from(selectedIds), isPriv)
              }
              onBatchToggleFavorite={() =>
                handleBatchToggleFavorite(Array.from(selectedIds))
              }
            />
          ) : activeTab === 'albums' ? (
            <AlbumsView
              albums={albums}
              media={media}
              isVaultUnlocked={isVaultUnlocked}
              onRequestUnlock={() => {
                setShowPinModal({
                  open: true,
                  mode: 'unlock',
                  onSuccessCallback: () => setIsVaultUnlocked(true),
                });
              }}
              onOpenCreateAlbum={() => setShowAlbumModal({ open: true })}
              onEditAlbum={(album) => setShowAlbumModal({ open: true, albumToEdit: album })}
              onDeleteAlbum={handleDeleteAlbum}
              onItemClick={(item, index, scopedItems) => {
                setViewerState({
                  open: true,
                  index,
                  items: scopedItems,
                });
              }}
              onOpenImportForAlbum={(albumId) =>
                setShowImportModal({ open: true, albumId, isPrivate: false })
              }
              onBatchDelete={handleBatchDelete}
              onBatchMoveAlbum={(ids) =>
                setShowBatchMoveModal({ open: true, targetIds: ids })
              }
              onBatchTogglePrivate={handleBatchTogglePrivate}
              onBatchToggleFavorite={handleBatchToggleFavorite}
            />
          ) : activeTab === 'vault' ? (
            // Private Vault view
            !isVaultUnlocked ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <PinScreen
                  mode={settings.hasPin ? 'unlock' : 'setup'}
                  settings={settings}
                  onSuccess={() => setIsVaultUnlocked(true)}
                  onUpdateSettings={async (updated) => {
                    await saveSecuritySettings(updated);
                    setSettings((prev) => ({ ...prev, ...updated }));
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Vault banner */}
                <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-300">
                      Private Vault ({privateVaultMedia.length} protected)
                    </span>
                  </div>
                  <button
                    onClick={handleLockVault}
                    className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline"
                  >
                    Lock Now
                  </button>
                </div>

                <GalleryGrid
                  items={privateVaultMedia}
                  filter={filter}
                  onFilterChange={setFilter}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  isSelectionMode={isSelectionMode}
                  selectedIds={selectedIds}
                  onToggleSelect={(id) => {
                    const next = new Set(selectedIds);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    setSelectedIds(next);
                  }}
                  onSelectAll={() => setSelectedIds(new Set(privateVaultMedia.map((m) => m.id)))}
                  onClearSelection={() => setSelectedIds(new Set())}
                  onItemClick={(item, index) => {
                    setViewerState({
                      open: true,
                      index,
                      items: privateVaultMedia,
                    });
                  }}
                  onOpenImport={() => setShowImportModal({ open: true, isPrivate: true })}
                  onBatchDelete={() => handleBatchDelete(Array.from(selectedIds))}
                  onBatchMoveAlbum={() =>
                    setShowBatchMoveModal({ open: true, targetIds: Array.from(selectedIds) })
                  }
                  onBatchTogglePrivate={(isPriv) =>
                    handleBatchTogglePrivate(Array.from(selectedIds), isPriv)
                  }
                  onBatchToggleFavorite={() =>
                    handleBatchToggleFavorite(Array.from(selectedIds))
                  }
                  isVaultView
                />
              </div>
            )
          ) : (
            <SettingsView
              settings={settings}
              media={media}
              albums={albums}
              onOpenPinChange={() =>
                setShowPinModal({
                  open: true,
                  mode: settings.hasPin ? 'change' : 'setup',
                  onSuccessCallback: () => loadData(),
                })
              }
              onUpdateSettings={async (updated) => {
                await saveSecuritySettings(updated);
                setSettings((prev) => ({ ...prev, ...updated }));
              }}
              onResetAllData={handleResetAllData}
              onLockVault={handleLockVault}
            />
          )}

          {/* Floating Action Button (FAB) for Import (Photos/Albums/Vault tabs) */}
          {activeTab !== 'settings' && (!isSelectionMode || selectedIds.size === 0) && (
            <button
              onClick={() => {
                triggerHaptic('light');
                setShowImportModal({
                  open: true,
                  isPrivate: activeTab === 'vault',
                });
              }}
              className="absolute right-5 bottom-20 w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-neutral-950 shadow-xl shadow-amber-500/30 flex items-center justify-center transition-all z-30"
              title="Import photos and videos"
            >
              <Plus className="w-7 h-7 stroke-[2.5]" />
            </button>
          )}
        </main>

        {/* Android Material 3 Bottom Navigation Bar */}
        <nav className="w-full h-16 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800/80 grid grid-cols-4 items-center shrink-0 z-30">
          {[
            { id: 'photos', label: 'Photos', icon: ImageIcon },
            { id: 'albums', label: 'Albums', icon: Folder },
            {
              id: 'vault',
              label: 'Vault',
              icon: isVaultUnlocked ? Unlock : Shield,
              badge: isVaultUnlocked ? 'Open' : undefined,
            },
            { id: 'settings', label: 'Privacy', icon: Settings },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabSwitch(tab.id as GalleryTab)}
                className="flex flex-col items-center justify-center h-full active:scale-95 transition-all relative"
              >
                <div
                  className={`px-4 py-1 rounded-full transition-colors flex items-center justify-center ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-[10px] font-semibold tracking-tight mt-1 ${
                    isActive ? 'text-amber-400' : 'text-neutral-400'
                  }`}
                >
                  {tab.label}
                </span>

                {tab.id === 'vault' && isVaultUnlocked && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-2 right-6" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Android Home Navigation Bar Pill indicator */}
        <div className="w-full flex justify-center py-1.5 shrink-0 bg-neutral-950 select-none">
          <div className="w-32 h-1 bg-neutral-700/80 rounded-full" />
        </div>
      </div>

      {/* PIN Modal (Unlock, Setup, or Change) */}
      {showPinModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <PinScreen
            mode={showPinModal.mode}
            settings={settings}
            onSuccess={() => {
              setShowPinModal({ open: false, mode: 'unlock' });
              showPinModal.onSuccessCallback?.();
            }}
            onCancel={() => setShowPinModal({ open: false, mode: 'unlock' })}
            onUpdateSettings={async (updated) => {
              await saveSecuritySettings(updated);
              setSettings((prev) => ({ ...prev, ...updated }));
            }}
          />
        </div>
      )}

      {/* Fullscreen Media Viewer */}
      {viewerState.open && (
        <MediaViewer
          items={viewerState.items}
          currentIndex={viewerState.index}
          albums={albums}
          onClose={() => setViewerState({ open: false, index: 0, items: [] })}
          onNavigate={(newIndex) => setViewerState((v) => ({ ...v, index: newIndex }))}
          onToggleFavorite={handleToggleFavorite}
          onTogglePrivate={handleTogglePrivate}
          onMoveToAlbum={handleMoveToAlbum}
          onDelete={handleDeleteItem}
        />
      )}

      {/* Import Modal */}
      {showImportModal.open && (
        <MediaImporter
          albums={albums}
          initialAlbumId={showImportModal.albumId}
          initialPrivate={showImportModal.isPrivate}
          onClose={() => setShowImportModal({ open: false })}
          onImportComplete={loadData}
        />
      )}

      {/* Album Create/Edit Modal */}
      {showAlbumModal.open && (
        <AlbumModal
          albumToEdit={showAlbumModal.albumToEdit}
          onClose={() => setShowAlbumModal({ open: false })}
          onSaved={loadData}
        />
      )}

      {/* Batch Move to Album Modal */}
      {showBatchMoveModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Move Selected Items</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Choose an album for {showBatchMoveModal.targetIds.length} items
            </p>

            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              <button
                onClick={() => handleBatchMoveComplete(null)}
                className="w-full p-3 rounded-2xl text-left text-xs font-medium bg-neutral-950 text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                None (Unassigned / Camera Roll)
              </button>

              {albums.map((alb) => (
                <button
                  key={alb.id}
                  onClick={() => handleBatchMoveComplete(alb.id)}
                  className="w-full p-3 rounded-2xl text-left text-xs font-medium bg-neutral-950 text-neutral-300 hover:bg-neutral-800 transition-colors flex items-center justify-between"
                >
                  <span className="truncate">{alb.name}</span>
                  {alb.isPrivate && <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                </button>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowBatchMoveModal({ open: false, targetIds: [] })}
                className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
