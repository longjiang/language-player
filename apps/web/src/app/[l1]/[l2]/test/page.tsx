'use client';

import { useState } from 'react';
import { TabbedPanel } from '@/components/tabbed-panel';

const latinText = Array.from(
  { length: 10 },
  () => `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin purus. Mauris interdum lectus turpis, nec tincidunt nunc ultricies vitae. Fusce vitae diam sit amet quam bibendum convallis. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at nibh elementum imperdiet. Duis sagittis ipsum.

Vestibulum dapibus nunc ac augue. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; In ac dui quis mi consectetuer lacinia. Nam pretium turpis et arcu. Duis arcu tortor, suscipit eget, imperdiet nec, imperdiet iaculis, ipsum. Sed aliquam ultrices mauris. Integer ante arcu, accumsan a, consectetuer eget, posuere ut, mauris. Praesent adipiscing. Phasellus ullamcorper ipsum rutrum nunc. Nunc nonummy metus.

Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Mauris turpis nunc, iaculis vitae, volutpat vel, consequat eu, metus. Nulla facilisi. Etiam vitae tortor. Morbi vestibulum volutpat enim. Aliquam erat volutpat. Integer tincidunt. Cras dapibus. Vivamus elementum semper nisi. Aenean vulputate eleifend tellus. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim. Aliquam lorem ante, dapibus in, viverra quis, feugiat a, tellus.

Phasellus viverra nulla ut metus varius laoreet. Quisque rutrum. Aenean imperdiet. Etiam ultricies nisi vel augue. Curabitur ullamcorper ultricies nisi. Nam eget dui. Etiam rhoncus. Maecenas tempus, tellus eget condimentum rhoncus, sem quam semper libero, sit amet adipiscing sem neque sed ipsum. Nam quam nunc, blandit vel, luctus pulvinar, hendrerit id, lorem. Maecenas nec odio et ante tincidunt tempus. Donec vitae sapien ut libero venenatis faucibus. Nullam quis ante. Etiam sit amet orci eget eros faucibus tincidunt.
`.trim(),
).join('\n\n');

const chineseText = `
在一個寧靜的小鎮上，有一條清澈見底的小河，河邊種滿了垂柳和櫻花樹。每當春天來臨，粉紅色的花瓣隨風飄落，像是為大地鋪上了一層柔軟的花毯。孩子們在河邊嬉戲玩耍，老人們則坐在樹蔭下悠閒地聊天喝茶。這樣的生活雖然簡單，卻充滿了溫馨和幸福。

小明是這個小鎮上的一個普通男孩，他最大的愛好就是閱讀各種各樣的書籍。無論是中國古典文學，還是外國的科幻小說，他都能津津有味地讀上一整天。他的房間裡堆滿了書，桌上、床上、甚至地上到處都是。他的媽媽常常笑著說他是個「小書蟲」。

有一天，小明在圖書館裡發現了一本非常古老的書，書名叫做《時光之鑰》。封面已經泛黃，邊角也有些破損，但小明卻被它深深吸引住了。他小心翼翼地翻開書頁，發現裡面記載著各種奇妙的冒險故事，每一個故事都像是一扇通往另一個世界的大門。

他開始每天放學後都到圖書館閱讀這本書，漸漸地，他發現書中的故事似乎不僅僅是虛構的。有些情節竟然和他生活中發生的事情有著驚人的相似之處。這讓他感到既興奮又困惑，他決定要解開這本書背後的秘密。

經過幾個月的探索和研究，小明終於發現，這本《時光之鑰》其實是一本能夠預知未來的書。但書中還有一個警告：未來並不是固定不變的，每一個選擇都會改變未來的走向。這個發現讓小明既欣喜又惶恐，因為他意識到，自己手中的不僅僅是一本書，更是一份沉重的責任。

從那天起，小明開始更加謹慎地做出每一個決定。他學會了珍惜當下，也明白了命運掌握在自己手中的道理。這個小鎮上的普通男孩，因為一本古老的書，踏上了一段不平凡的旅程。
`.trim();

const tabs = [
  { key: 'latin', label: 'Latin' },
  { key: 'chinese', label: '中文' },
] as const;

export default function TestPage() {
  const [activeTab, setActiveTab] = useState('latin');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <TabbedPanel
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        className="h-[80vh] w-full max-w-3xl"
        contentClassName="overflow-y-auto p-6"
      >
        {activeTab === 'latin' && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-card-foreground">
            {latinText}
          </p>
        )}
        {activeTab === 'chinese' && (
          <p className="whitespace-pre-line text-base leading-relaxed text-card-foreground">
            {chineseText}
          </p>
        )}
      </TabbedPanel>
    </div>
  );
}
