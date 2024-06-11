import { get, omit } from "lodash-es"
import type { RouteObject } from "react-router-dom"

type NestedStructure = { [key: string]: NestedStructure }

function nestPaths(paths: string[]): NestedStructure {
  const result: NestedStructure = {}

  paths.forEach((path) => {
    // Remove the './pages' prefix and the '.tsx' suffix
    const trimmedPath = path.replace("./pages/", "").replace(".tsx", "")
    const parts = trimmedPath.split("/")

    let currentLevel = result
    for (const part of parts) {
      if (!currentLevel[part]) {
        currentLevel[part] = {}
      }
      currentLevel = currentLevel[part]
    }
  })

  return result
}
const pathGetterSet = new Set<string>()
export function convertGlobToRoutes(
  glob: Record<string, () => Promise<any>>,
): RouteObject[] {
  const keys = Object.keys(glob)
  const paths = nestPaths(keys)

  const routeObject: RouteObject[] = []

  function dtsRoutes(
    parentKey: string,
    children: RouteObject[],
    paths: NestedStructure,
  ) {
    const pathKeys = Object.keys(paths)
    // sort `layout` to the start, and `index` to the end
    pathKeys.sort((a, b) => {
      if (a === "layout") {
        return -1
      }
      if (b === "layout") {
        return 1
      }
      if (a === "index") {
        return 1
      }
      if (b === "index") {
        return -1
      }
      return a.localeCompare(b)
    })

    // sort, if () group, then move to the end
    pathKeys.sort((a, b) => {
      if (a.startsWith("(") && a.endsWith(")")) {
        return 1
      }
      if (b.startsWith("(") && b.endsWith(")")) {
        return -1
      }
      return 0
    })

    // TODO biz priority
    // move `(main)` to the top
    const mainIndex = pathKeys.indexOf("(main)")
    if (mainIndex !== -1) {
      pathKeys.splice(mainIndex, 1)
      pathKeys.unshift("(main)")
    }

    for (const key of pathKeys) {
      const isGroupedRoute = key.startsWith("(") && key.endsWith(")")

      const segmentPathKey = parentKey + key

      if (isGroupedRoute) {
        const accessPath = `${segmentPathKey}/layout.tsx`
        const globGetter = get(glob, accessPath)
        if (pathGetterSet.has(accessPath)) {
          // throw new Error(`duplicate path: ` + accessPath)

          console.error(`duplicate path: ${accessPath}`)
        }
        pathGetterSet.add(accessPath)

        if (!globGetter) {
          throw new Error("grouped route must have a layout file")
        }

        const childrenChildren: RouteObject[] = []
        dtsRoutes(`${segmentPathKey}/`, childrenChildren, paths[key])
        children.push({
          path: "",
          lazy: globGetter,
          children: childrenChildren,
        })
      } else if (key === "layout") {
        // if parent key is grouped routes, the layout is handled, so skip this logic
        if (parentKey.endsWith(")/")) {
          continue
        }
        // if `key` is `layout`, then it's a grouped route
        const accessPath = `${segmentPathKey}.tsx`
        const globGetter = get(glob, accessPath)
        // console.log(segmentPathKey, key, globGetter, "layout")
        const childrenChildren: RouteObject[] = []
        dtsRoutes(parentKey, childrenChildren, omit(paths, "layout"))
        children.push({
          path: "",
          lazy: globGetter,
          children: childrenChildren,
        })
        break
      } else {
        const content = paths[key]
        const hasChild = Object.keys(content).length > 0

        const normalizeKey = normalizePathKey(key)

        if (!hasChild) {
          const accessPath = `${segmentPathKey}.tsx`
          const globGetter = get(glob, accessPath)

          if (pathGetterSet.has(`${segmentPathKey}.tsx`)) {
            // throw new Error(`duplicate path: ` + accessPath)
            console.error(`duplicate path: ${accessPath}`)
            // continue
          }
          pathGetterSet.add(accessPath)

          children.push({
            path: normalizeKey,
            lazy: globGetter,
          })
        } else {
          const childrenChildren: RouteObject[] = []
          dtsRoutes(`${segmentPathKey}/`, childrenChildren, paths[key])
          children.push({
            path: normalizeKey,
            children: childrenChildren,
          })
        }
      }
    }
  }

  dtsRoutes("./pages/", routeObject, paths)
  return routeObject
}

const normalizePathKey = (key: string) => {
  if (key === "index") {
    return ""
  }

  if (key.startsWith("[:") && key.endsWith("]")) {
    return `:${key.slice(2, -1)}`
  }
  return key
}
