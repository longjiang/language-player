import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { type TocTree } from '@langplayer/textbooks';
import { router } from 'expo-router';
import { ICON_MUTED } from '@/lib/theme-colors';
import { mobileTaskHref } from '@/lib/textbook-routes';

interface TextbookTocProps {
  tree: TocTree;
  /** Currently open task id, if any. */
  currentTaskId?: string;
}

/**
 * Units → lessons → tasks navigation.
 *
 * The mobile counterpart of the web TOC. Where the web keeps this in a sidebar
 * beside the task, mobile shows it as its own screen (there is no room for a
 * persistent sidebar on a phone) with the same collapsible-group behaviour:
 * collapsed by default, expanded when the group contains the open task.
 */
export function TextbookToc({ tree, currentTaskId }: TextbookTocProps) {
  const active = currentTaskId
    ? tree.units
        .flatMap((u) => u.lessons.map((l) => ({ unitId: u.id, lessonId: l.id, tasks: l.tasks })))
        .find((l) => l.tasks.some((task) => task.id === currentTaskId))
    : undefined;

  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>(
    active ? { [active.unitId]: true } : {},
  );
  const [openLessons, setOpenLessons] = useState<Record<string, boolean>>(
    active ? { [`${active.unitId}/${active.lessonId}`]: true } : {},
  );

  const isUnitOpen = (unitId: string) => openUnits[unitId] ?? unitId === active?.unitId;
  const isLessonOpen = (unitId: string, lessonId: string) =>
    openLessons[`${unitId}/${lessonId}`] ??
    (unitId === active?.unitId && lessonId === active?.lessonId);

  return (
    <View className="gap-1">
      <Text className="px-2 pb-2 text-xs font-medium uppercase text-muted-foreground">
        {tree.bookTitle}
      </Text>

      {tree.units.map((unit) => {
        const unitOpen = isUnitOpen(unit.id);
        return (
          <View key={unit.id}>
            <Pressable
              onPress={() => setOpenUnits((s) => ({ ...s, [unit.id]: !unitOpen }))}
              accessibilityRole="button"
              accessibilityState={{ expanded: unitOpen }}
              className="flex-row items-center gap-1.5 rounded px-2 py-2"
            >
              <ChevronDown
                size={14}
                color={ICON_MUTED}
                style={{ transform: [{ rotate: unitOpen ? '0deg' : '-90deg' }] }}
              />
              <Text className="font-medium text-foreground">
                {unit.number}. {unit.title}
              </Text>
            </Pressable>

            {unitOpen &&
              unit.lessons.map((lesson) => {
                const lessonOpen = isLessonOpen(unit.id, lesson.id);
                return (
                  <View key={lesson.id} className="ml-3">
                    <Pressable
                      onPress={() =>
                        setOpenLessons((s) => ({ ...s, [`${unit.id}/${lesson.id}`]: !lessonOpen }))
                      }
                      accessibilityRole="button"
                      accessibilityState={{ expanded: lessonOpen }}
                      className="flex-row items-center gap-1.5 rounded px-2 py-2"
                    >
                      <ChevronDown
                        size={14}
                        color={ICON_MUTED}
                        style={{ transform: [{ rotate: lessonOpen ? '0deg' : '-90deg' }] }}
                      />
                      <Text className="text-foreground">
                        {lesson.letter}. {lesson.title}
                      </Text>
                    </Pressable>

                    {lessonOpen &&
                      lesson.tasks.map((task) => {
                        const isActive = task.id === currentTaskId;
                        return (
                          <Pressable
                            key={task.id}
                            onPress={() => router.push(mobileTaskHref(task.id) as never)}
                            accessibilityRole="link"
                            accessibilityState={{ selected: isActive }}
                            className={`ml-4 flex-row items-center gap-2 rounded px-2 py-2 ${
                              isActive ? 'bg-primary/10' : ''
                            }`}
                          >
                            <Text
                              className={
                                isActive ? 'font-medium text-primary' : 'text-muted-foreground'
                              }
                            >
                              {task.number}
                            </Text>
                            {task.type && (
                              <Text className="text-xs text-muted-foreground">{task.type}</Text>
                            )}
                          </Pressable>
                        );
                      })}
                  </View>
                );
              })}
          </View>
        );
      })}
    </View>
  );
}
