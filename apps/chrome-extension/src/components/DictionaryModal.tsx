import React from 'react';
import type { LemmatizedToken } from '@langplayer/shared';
import { Dialog } from './ui/dialog';
import DictionaryCard from './DictionaryCard';
import { t } from '../i18n';

interface DictionaryModalProps {
  token: LemmatizedToken | null;
  l1Code: string;
  l2Code: string;
  contextText?: string;
  cueStartTime?: number;
  videoTitle?: string;
  pageUrl?: string;
  isPro: boolean;
  subLoading: boolean;
  onClose: () => void;
}

/**
 * Web-parity dictionary surface. The lookup remains lazy because the card is
 * mounted only after a token is selected, but it is presented as a modal so
 * the transcript/page surface stays available underneath it.
 */
export const DictionaryModal: React.FC<DictionaryModalProps> = ({
  token,
  l1Code,
  l2Code,
  contextText,
  cueStartTime,
  videoTitle,
  pageUrl,
  isPro,
  subLoading,
  onClose,
}) => {
  return (
    <Dialog
      open={!!token}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={token?.text || t('dictionary')}
      closeLabel={t('close')}
      className="lpv-dictionary-dialog"
      showHeader={false}
    >
      {token && (
        <DictionaryCard
          token={token}
          l1Code={l1Code}
          l2Code={l2Code}
          contextText={contextText}
          cueStartTime={cueStartTime}
          videoTitle={videoTitle}
          pageUrl={pageUrl}
          isPro={isPro}
          subLoading={subLoading}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
};

export default DictionaryModal;
