import { defineStore } from "pinia"
import type {
  MetaEpisode,
  MetaEpisodeOnDisk,
  MetaManga,
  MetaMangaOnDisk,
} from "src/logic/download-manager"
import type { ShallowReactive } from "vue"

export const useIDMStore = defineStore("IDM", () => {
  const loadingDataInMemory = ref(false)

  const mapMetaManga = reactive<
    Map<
      number,
      ShallowReactive<
        MetaMangaOnDisk & {
          count_ep: number
        }
      >
    >
  >(new Map())
  const queue = reactive<
    Map<number, Map<number, ReturnType<typeof createTaskDownloadEpisode>>>
  >(new Map())
  const listMangaSorted = reactive<
    (MetaMangaOnDisk & {
      count_ep: number
    })[]
  >([])

  async function runLoadInMemory() {
    let gettedList = false
    if (!gettedList) {
      loadingDataInMemory.value = true
      // eslint-disable-next-line promise/catch-or-return, promise/always-return
      getListManga().then(async (list) => {
        await Promise.all(
          list.map(async (item) => {
            const itemReactive = shallowReactive<
              MetaMangaOnDisk & {
                count_ep: number
              }
            >({
              ...item,
              count_ep: await getCountEpisodes(item.manga_id),
            })
            mapMetaManga.set(item.manga_id, itemReactive)
            listMangaSorted.push(itemReactive)
          })
        )
        loadingDataInMemory.value = false
      })
      gettedList = true
    }
  }

  async function download(metaManga: MetaManga, metaEp: MetaEpisode) {
    console.log(metaManga, metaEp)
    const task = createTaskDownloadEpisode(metaManga, metaEp)

    if (!mapMetaManga.has(metaManga.manga_id)) {
      const manga = shallowReactive({
        ...(await task.startSaveMetaManga()),
        count_ep: 0,
      })
      mapMetaManga.set(manga.manga_id, manga)
      listMangaSorted.unshift(manga)
    }

    let store = queue.get(metaManga.manga_id)
    if (store) {
      store.set(metaEp.ep_id, task)
    } else
      queue.set(metaManga.manga_id, (store = new Map([[metaEp.ep_id, task]])))

    await task.start()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    mapMetaManga.get(metaManga.manga_id)!.count_ep++
    store.delete(metaEp.ep_id)

    return task
  }

  async function resumeDownload(
    metaManga: MetaManga,
    task:
      | Awaited<ReturnType<typeof download>>
      | {
          ref: MetaEpisodeOnDisk
        }
  ) {
    if (
      typeof (task as Awaited<ReturnType<typeof download>>).resume ===
      "function"
    )
      return (task as Awaited<ReturnType<typeof download>>).resume()

    return download(
      metaManga,
      (
        task as {
          ref: MetaEpisodeOnDisk
        }
      ).ref
    )
  }

  return {
    loadingDataInMemory,
    mapMetaManga,
    listMangaSorted,
    queue,
    runLoadInMemory,
    download,
    resumeDownload,
  }
})
