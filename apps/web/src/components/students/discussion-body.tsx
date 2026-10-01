import {
  MENTION_ALL,
  parseDiscussionBody,
  type InlineToken,
} from '@fcare/shared-types';
import { Fragment, type ReactNode } from 'react';

interface DiscussionBodyProps {
  body: string;
  /** Tin của chính mình nằm trên nền xanh đậm → chip nhắc tên đổi tông cho đủ tương phản. */
  mine: boolean;
  /** Mã nhân viên của người đang xem — chip nhắc đúng mình được làm nổi. */
  selfCode?: string;
}

function mentionClass(token: InlineToken & { kind: 'mention' }, mine: boolean, selfCode?: string) {
  const code = token.code.toLowerCase();
  const isSelf = code === MENTION_ALL || (selfCode !== undefined && code === selfCode.toLowerCase());
  if (mine) return 'bg-white/20 text-white';
  return isSelf ? 'bg-fpt-orange/20 text-fpt-blue-900' : 'bg-fpt-blue/10 text-fpt-blue';
}

function renderInline(tokens: InlineToken[], mine: boolean, selfCode?: string): ReactNode[] {
  return tokens.map((token, index) => {
    let node: ReactNode =
      token.kind === 'text' ? (
        token.text
      ) : (
        <span
          className={`rounded px-1 py-px font-semibold ${mentionClass(token, mine, selfCode)}`}
        >
          @{token.code}
        </span>
      );
    if (token.italic) node = <em>{node}</em>;
    if (token.bold) node = <strong className="font-semibold">{node}</strong>;
    return <Fragment key={index}>{node}</Fragment>;
  });
}

/**
 * Hiển thị tin trao đổi đã định dạng. Dựng từ cây token thành phần tử React —
 * KHÔNG dùng innerHTML, nên nội dung người gõ không bao giờ chạy như mã.
 */
export function DiscussionBody({ body, mine, selfCode }: DiscussionBodyProps) {
  const blocks = parseDiscussionBody(body);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((block, index) => {
        if (block.type === 'paragraph') {
          return (
            <p key={index} className="whitespace-pre-wrap">
              {block.lines.map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 ? <br /> : null}
                  {renderInline(line, mine, selfCode)}
                </Fragment>
              ))}
            </p>
          );
        }
        const ListTag = block.ordered ? 'ol' : 'ul';
        return (
          <ListTag
            key={index}
            className={`space-y-0.5 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="whitespace-pre-wrap">
                {renderInline(item, mine, selfCode)}
              </li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}
