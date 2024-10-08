/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*-
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_TEXTURECLIENT_RECYCLE_ALLOCATOR_H
#define MOZILLA_GFX_TEXTURECLIENT_RECYCLE_ALLOCATOR_H

#include <map>
#include <stack>
#include "mozilla/gfx/Types.h"
#include "mozilla/RefPtr.h"
#include "TextureClient.h"
#include "mozilla/Mutex.h"

namespace mozilla {
namespace layers {

class ISurfaceAllocator;
class TextureClientHolder;


/**
 * TextureClientRecycleAllocator provides TextureClients allocation and
 * recycling capabilities. It expects allocations of same sizes and
 * attributres. If a recycled TextureClient is different from
 * requested one, the recycled one is dropped and new TextureClient is allocated.
 *
 * By default this uses TextureClient::CreateForDrawing to allocate new texture
 * clients.
 */
class TextureClientRecycleAllocator
{
protected:
  virtual ~TextureClientRecycleAllocator();

public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(TextureClientRecycleAllocator)

  explicit TextureClientRecycleAllocator(CompositableForwarder* aAllocator);

  void SetMaxPoolSize(uint32_t aMax);

  // Creates and allocates a TextureClient.
  already_AddRefed<TextureClient>
  CreateOrRecycle(gfx::SurfaceFormat aFormat,
                  gfx::IntSize aSize,
                  BackendSelector aSelector,
                  TextureFlags aTextureFlags,
                  TextureAllocationFlags flags = ALLOC_DEFAULT);

  void ShrinkToMinimumSize();

protected:
  virtual already_AddRefed<TextureClient>
  Allocate(gfx::SurfaceFormat aFormat,
           gfx::IntSize aSize,
           BackendSelector aSelector,
           TextureFlags aTextureFlags,
           TextureAllocationFlags aAllocFlags);

  RefPtr<CompositableForwarder> mSurfaceAllocator;

private:
  friend class TextureClient;
  void RecycleTextureClient(TextureClient* aClient);

  static const uint32_t kMaxPooledSized = 2;
  uint32_t mMaxPooledSize;

  std::map<TextureClient*, RefPtr<TextureClientHolder> > mInUseClients;

  // On b2g gonk, std::queue might be a better choice.
  // On ICS, fence wait happens implicitly before drawing.
  // Since JB, fence wait happens explicitly when fetching a client from the pool.
  // stack is good from Graphics cache usage point of view.
  std::stack<RefPtr<TextureClientHolder> > mPooledClients;
  Mutex mLock;
};

} // namespace layers
} // namespace mozilla

#endif /* MOZILLA_GFX_TEXTURECLIENT_RECYCLE_ALLOCATOR_H */
