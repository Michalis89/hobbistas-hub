import { act, renderHook, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import {
  deriveAltFromFilename,
  isEditorImageFile,
  useEditorImageUpload,
} from '@/app/components/editor/useEditorImageUpload';

const uploadArticleBodyImageMock = jest.fn();

jest.mock('@/lib/media/uploadArticleImage', () => ({
  uploadArticleBodyImage: (...args: unknown[]) => uploadArticleBodyImageMock(...args),
}));

function makeEditorMock() {
  const setFigure = jest.fn();
  const run = jest.fn();
  const chain = {
    focus: jest.fn().mockReturnThis(),
    setFigure: setFigure.mockImplementation(() => chain),
    run,
  };
  const editor = { chain: jest.fn(() => chain) } as unknown as Editor;
  return { editor, spies: { setFigure, run } };
}

const makeFile = (name: string, type: string) => new File(['x'], name, { type });

describe('deriveAltFromFilename', () => {
  it('turns a filename into readable alt text', () => {
    expect(deriveAltFromFilename('kratos-god-of-war.png')).toBe('kratos god of war');
    expect(deriveAltFromFilename('my_cover_image.jpeg')).toBe('my cover image');
  });

  it('handles names without an extension', () => {
    expect(deriveAltFromFilename('cover')).toBe('cover');
  });
});

describe('isEditorImageFile', () => {
  it('accepts the supported image types', () => {
    expect(isEditorImageFile(makeFile('a.png', 'image/png'))).toBe(true);
    expect(isEditorImageFile(makeFile('a.avif', 'image/avif'))).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isEditorImageFile(makeFile('a.svg', 'image/svg+xml'))).toBe(false);
    expect(isEditorImageFile(makeFile('a.html', 'text/html'))).toBe(false);
    expect(isEditorImageFile(makeFile('a.png', ''))).toBe(false);
  });
});

describe('useEditorImageUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads an image and inserts a figure with derived alt text', async () => {
    uploadArticleBodyImageMock.mockResolvedValue('https://cdn.example.com/a.png');
    const { editor, spies } = makeEditorMock();
    const { result } = renderHook(() => useEditorImageUpload(editor));

    await act(async () => {
      await result.current.insertFiles([makeFile('spira-shot.png', 'image/png')]);
    });

    expect(uploadArticleBodyImageMock).toHaveBeenCalledTimes(1);
    expect(spies.setFigure).toHaveBeenCalledWith({
      src: 'https://cdn.example.com/a.png',
      alt: 'spira shot',
    });
    expect(spies.run).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.isUploading).toBe(false);
  });

  it('inserts multiple images in order', async () => {
    uploadArticleBodyImageMock
      .mockResolvedValueOnce('https://cdn.example.com/1.png')
      .mockResolvedValueOnce('https://cdn.example.com/2.png');
    const { editor, spies } = makeEditorMock();
    const { result } = renderHook(() => useEditorImageUpload(editor));

    await act(async () => {
      await result.current.insertFiles([
        makeFile('one.png', 'image/png'),
        makeFile('two.png', 'image/png'),
      ]);
    });

    expect(spies.setFigure).toHaveBeenNthCalledWith(1, expect.objectContaining({ alt: 'one' }));
    expect(spies.setFigure).toHaveBeenNthCalledWith(2, expect.objectContaining({ alt: 'two' }));
  });

  it('surfaces the server error message', async () => {
    uploadArticleBodyImageMock.mockRejectedValue(new Error('Image is too large.'));
    const { editor, spies } = makeEditorMock();
    const { result } = renderHook(() => useEditorImageUpload(editor));

    await act(async () => {
      await result.current.insertFiles([makeFile('big.png', 'image/png')]);
    });

    await waitFor(() => expect(result.current.error).toBe('Image is too large.'));
    expect(spies.setFigure).not.toHaveBeenCalled();
    expect(result.current.isUploading).toBe(false);
  });

  it('rejects unsupported files without calling the API', async () => {
    const { editor } = makeEditorMock();
    const { result } = renderHook(() => useEditorImageUpload(editor));

    await act(async () => {
      await result.current.insertFiles([makeFile('doc.pdf', 'application/pdf')]);
    });

    await waitFor(() => expect(result.current.error).toMatch(/Unsupported image type/));
    expect(uploadArticleBodyImageMock).not.toHaveBeenCalled();
  });

  it('does nothing when there is no editor yet', async () => {
    const { result } = renderHook(() => useEditorImageUpload(null));

    await act(async () => {
      await result.current.insertFiles([makeFile('a.png', 'image/png')]);
    });

    expect(uploadArticleBodyImageMock).not.toHaveBeenCalled();
  });

  it('clears the error on demand', async () => {
    uploadArticleBodyImageMock.mockRejectedValue(new Error('nope'));
    const { editor } = makeEditorMock();
    const { result } = renderHook(() => useEditorImageUpload(editor));

    await act(async () => {
      await result.current.insertFiles([makeFile('a.png', 'image/png')]);
    });
    await waitFor(() => expect(result.current.error).toBe('nope'));

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
