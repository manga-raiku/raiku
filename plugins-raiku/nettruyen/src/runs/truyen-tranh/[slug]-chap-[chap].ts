import type { API, Chapter, ComicChapter } from "raiku-pgs/plugin"
import { normalizeChName, pathIsHome, PostWorker } from "raiku-pgs/plugin"

import { meta } from "../../../config"
import { CURL } from "../../const"
import { getParamComicAndChap } from "../../parsers/__helpers__/getParamComicAndChap"
import Parse from "../../parsers/truyen-tranh/[slug]/[ep-id]"

export default async function <Fast extends boolean>(
  { get }: Pick<API, "get">,
  slug: string,
  fast: Fast,
): Promise<
  Fast extends true
    ? ComicChapter
    : ComicChapter & {
        readonly chapters: Chapter[]
      }
> {
  const { data, url } = await get({ url: `${CURL}/truyen-tranh/${slug}` })

  // eslint-disable-next-line functional/no-throw-statement
  if (pathIsHome(url)) throw new Error("not_found")

  const result = await Parse(data, Date.now())
  if (!fast) {
    const { data } = await get({
      url: `${CURL}/Comic/Services/ComicService.asmx/ProcessChapterList?comicId=${result.manga_id}`,
    })
    return {
      ...result,
      chapters: JSON.parse(data).chapters.map(
        (item: { chapterId: number; name: string; url: string }) => {
          const route = {
            name: "comic chap",
            params: {
              sourceId: meta.id,
              ...getParamComicAndChap(item.url),
            },
          } as const

          return {
            id: item.chapterId,
            name: normalizeChName(item.name),
            route,
            updated_at: null,
          }
        },
      ),
    } as Fast extends true
      ? ComicChapter
      : ComicChapter & {
          readonly chapters: Chapter[]
        }
  }

  return result as Fast extends true
    ? ComicChapter
    : ComicChapter & {
        readonly chapters: Chapter[]
      }
}
